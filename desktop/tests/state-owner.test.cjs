/**
 * @file Real durable project/CAS/alias controls and retained asynchronous operation ownership.
 * @remarks Functions, parameters, state variables and exact declaration locations: generated docs/code-map.md (pnpm code-map).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openState } = require('../state.cjs');
const { openProfile, admitProfile } = require('../profile.cjs');
const { readRegular, readUtf8, newFile } = require('../files.cjs');
const { createOperations, drainRuntime } = require('../operation.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  return root;
}
function validate(value) {
  if (!value || Object.keys(value).join('|') !== 'number' || !Number.isInteger(value.number))
    throw new Error('Invalid test state.');
  return value;
}
test('actual flushed saves preserve the previous project, reopen exactly and refuse stale CAS', (t) => {
  const root = fixture(t),
    owner = openProfile(path.join(root, 'workspace'));
  let store = openState(owner.directory, validate, { number: 1 });
  const original = store.load();
  const next = store.save({ number: 2 }, original.sha256);
  assert.equal(next.value.number, 2);
  assert.equal(next.hasPrevious, true);
  assert.equal(store.previous().number, 1);
  const current = fs.readFileSync(path.join(owner.directory, 'project.json'));
  assert.throws(() => store.save({ number: 3 }, original.sha256));
  assert.throws(() => store.save({ number: 'wrong' }, next.sha256));
  assert.deepEqual(fs.readFileSync(path.join(owner.directory, 'project.json')), current);
  owner.close();
  const second = openProfile(owner.directory);
  store = openState(second.directory, validate, { number: 0 });
  assert.equal(store.load().value.number, 2);
  assert.equal(store.previous().number, 1);
  second.close();
});
test('a changed or corrupt current member is preserved rather than silently reset', (t) => {
  const root = fixture(t),
    store = openState(root, validate, { number: 1 }),
    before = store.load();
  fs.writeFileSync(path.join(root, 'project.json'), '{"number":7}');
  assert.throws(() => store.save({ number: 2 }, before.sha256));
  fs.writeFileSync(path.join(root, 'project.json'), '{broken');
  assert.throws(() => openState(root, validate, { number: 0 }));
  assert.equal(fs.readFileSync(path.join(root, 'project.json'), 'utf8'), '{broken');
});
test('unknown files, stale locks and application-root profiles are refused intact', (t) => {
  const root = fixture(t),
    owner = openProfile(path.join(root, 'workspace'));
  assert.throws(() => openProfile(owner.directory));
  owner.close();
  fs.writeFileSync(path.join(owner.directory, 'unknown.txt'), 'preserve');
  assert.throws(() => admitProfile(owner.directory));
  assert.equal(fs.readFileSync(path.join(owner.directory, 'unknown.txt'), 'utf8'), 'preserve');
  assert.throws(() =>
    openProfile(path.join(root, 'installation', 'profile'), [path.join(root, 'installation')]),
  );
  assert.equal(fs.existsSync(path.join(root, 'installation')), false);
});
for (const slot of ['owner.json', 'owner.lock', 'project.json', 'previous.json'])
  test('hardlinked fixed member refused before mutation: ' + slot, (t) => {
    const root = fixture(t),
      owner = openProfile(path.join(root, 'workspace'));
    owner.close();
    const target = path.join(root, 'sentinel');
    fs.writeFileSync(target, 'outside sentinel');
    const member = path.join(owner.directory, slot);
    if (fs.existsSync(member)) fs.unlinkSync(member);
    fs.linkSync(target, member);
    assert.throws(() => openProfile(owner.directory));
    assert.equal(fs.readFileSync(target, 'utf8'), 'outside sentinel');
  });
test('actual directory alias ancestor is rejected without writing into its target', (t) => {
  const root = fixture(t),
    target = path.join(root, 'target'),
    alias = path.join(root, 'alias');
  fs.mkdirSync(target);
  fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => openProfile(path.join(alias, 'workspace')));
  assert.deepEqual(fs.readdirSync(target), []);
});
test('browser recovery files are statically admitted before Chromium can mutate an aliased target', (t) => {
  const root = fixture(t),
    owner = openProfile(path.join(root, 'workspace'));
  owner.close();
  const outside = path.join(root, 'outside');
  fs.writeFileSync(outside, 'retain recovery sentinel');
  fs.linkSync(outside, path.join(owner.browser, 'history.sqlite-shm'));
  assert.throws(() => openProfile(owner.directory));
  assert.equal(fs.readFileSync(outside, 'utf8'), 'retain recovery sentinel');
});
test('ordinary retained browser files remain usable and a changed ownership token is preserved', (t) => {
  const root = fixture(t),
    owner = openProfile(path.join(root, 'workspace'));
  fs.mkdirSync(path.join(owner.browser, 'Default'));
  fs.writeFileSync(path.join(owner.browser, 'Default', 'Preferences'), '{}');
  owner.close();
  const second = openProfile(owner.directory);
  assert.equal(fs.readFileSync(path.join(second.browser, 'Default', 'Preferences'), 'utf8'), '{}');
  fs.writeFileSync(path.join(second.directory, 'owner.lock'), 'changed external token');
  assert.throws(() => second.close());
  assert.equal(
    fs.readFileSync(path.join(second.directory, 'owner.lock'), 'utf8'),
    'changed external token',
  );
});
test('bounded reads reject oversized input, invalid UTF8 and overwrite while retaining the original bytes', (t) => {
  const root = fixture(t),
    file = path.join(root, 'input');
  newFile(file, 'abc');
  assert.equal(readRegular(file, 3).toString(), 'abc');
  assert.throws(() => readRegular(file, 2));
  assert.throws(() => newFile(file, 'replacement'));
  assert.equal(fs.readFileSync(file, 'utf8'), 'abc');
  const invalid = path.join(root, 'invalid');
  fs.writeFileSync(invalid, Buffer.from([255]));
  assert.throws(() => readUtf8(invalid, 1));
});
test('operation ownership retains a real held promise and refuses admission after repeated finish', async () => {
  const owner = createOperations();
  let release,
    completed = false;
  const task = owner.run(async () => {
    await new Promise((resolve) => {
      release = resolve;
    });
    completed = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  const finish = owner.finish();
  const repeat = owner.finish();
  assert.equal(owner.busy, true);
  assert.equal(owner.closing, true);
  assert.equal(completed, false);
  await assert.rejects(owner.run(async () => {}));
  release();
  await Promise.all([task, finish, repeat]);
  assert.equal(completed, true);
  assert.equal(owner.busy, false);
});
test('failed accepted work is reported to its caller and still fully drained before finish', async () => {
  const owner = createOperations();
  const task = owner.run(async () => {
    throw new Error('synthetic');
  });
  await assert.rejects(task, /synthetic/);
  await owner.finish();
  assert.equal(owner.busy, false);
});
test('a failed child cannot release an accepted actual local file write before it finishes', async (t) => {
  const owner = createOperations(),
    file = path.join(fixture(t), 'accepted-export.json');
  let release,
    finished = false;
  const work = owner.run(async () => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await fs.promises.writeFile(file, 'authorized export completed\n', { flag: 'wx' });
  });
  await new Promise(setImmediate);
  const runtime = {
    close: async () => {
      throw new Error('child failed');
    },
    exited: Promise.resolve({ code: 1 }),
  };
  const failed = assert.rejects(
    drainRuntime(runtime, owner).finally(() => {
      finished = true;
    }),
    /child failed/,
  );
  await new Promise(setImmediate);
  assert.equal(finished, false);
  assert.equal(owner.busy, true);
  assert.equal(fs.existsSync(file), false);
  release();
  await Promise.all([work, failed]);
  assert.equal(finished, true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'authorized export completed\n');
});
test('a transport failure still waits the actual child exit witness after local work is done', async () => {
  const owner = createOperations();
  let childExit,
    finished = false;
  const runtime = {
    close: async () => {
      throw new Error('transport failure');
    },
    exited: new Promise((resolve) => {
      childExit = resolve;
    }),
  };
  const failed = assert.rejects(
    drainRuntime(runtime, owner).finally(() => {
      finished = true;
    }),
    /transport failure/,
  );
  await new Promise(setImmediate);
  assert.equal(finished, false);
  childExit({ code: 1 });
  await failed;
  assert.equal(finished, true);
});
test('pre-child startup failure also retains accepted local work without reading an undefined runtime', async () => {
  const owner = createOperations();
  let release,
    finished = false;
  const work = owner.run(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await new Promise(setImmediate);
  const drain = drainRuntime(undefined, owner).then(() => {
    finished = true;
  });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  release();
  await Promise.all([work, drain]);
  assert.equal(finished, true);
});
