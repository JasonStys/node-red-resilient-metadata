/**
 * @file Real resource/file-scope controls and an independent bounded renderer protocol inventory.
 * @description Small inert filesystem fixtures exercise refusal before code loading, not a mocked hash result.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { createHash } = require('node:crypto');
const { OWNER, verifiedResources, responseFor } = require('../resources.cjs');
const { createAncestorAdmission, readRegular } = require('../files.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-resources-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const payload = path.join(root, 'payload'),
    owner = path.join(root, 'owner');
  fs.mkdirSync(payload);
  fs.mkdirSync(owner);
  const write = (base, names) =>
    Object.fromEntries(
      names.map((name) => {
        const text = 'inert ' + name;
        fs.mkdirSync(path.dirname(path.join(base, name)), { recursive: true });
        fs.writeFileSync(path.join(base, name), text);
        return [name, createHash('sha256').update(text).digest('hex')];
      }),
    );
  const metadata = {
    schema: 1,
    product: 'node-red-resilient-metadata',
    version: '1.1.0',
    source: 'a'.repeat(40),
    sourceDirty: false,
    files: write(payload, [
      'index.html',
      'app.js',
      'style.css',
      'runtime-package.json',
      'BUNDLED-NOTICES.txt',
      'library/workbench/project.js',
      'node_modules/node-red/package.json',
      'node_modules/npm/package.json',
      'node_modules/npm/docs/Actual file (with spaces).md',
      'library/nodes/metadata-service.js',
    ]),
    owner: write(owner, OWNER),
  };
  const save = () => fs.writeFileSync(path.join(payload, 'SOURCE.json'), JSON.stringify(metadata));
  save();
  return { root, payload, owner, metadata, save };
}
test('exact three UI resources only; real dependency names with spaces remain confined', async (t) => {
  const f = fixture(t),
    value = verifiedResources(f.payload, f.owner);
  const response = responseFor(new Request('metadata://workbench/'), value.data);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /inert/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
  for (const url of [
    'metadata://other/',
    'https://outside.invalid/',
    'metadata://workbench/library/workbench/project.js',
    'metadata://workbench/node_modules/npm/package.json',
    'metadata://workbench/project.json',
  ])
    assert.equal(responseFor(new Request(url), value.data).status, 404);
  assert.equal(
    responseFor(new Request('metadata://workbench/', { method: 'POST' }), value.data).status,
    404,
  );
  assert.equal(
    await responseFor(new Request('metadata://workbench/', { method: 'HEAD' }), value.data).text(),
    '',
  );
});
test('unknown empty directory refused before any descent', (t) => {
  const f = fixture(t),
    unknown = path.join(f.payload, 'unknown');
  fs.mkdirSync(unknown);
  const original = fs.opendirSync;
  let entered = false;
  fs.opendirSync = function (file, ...args) {
    if (file === unknown) entered = true;
    return original.call(this, file, ...args);
  };
  try {
    assert.throws(() => verifiedResources(f.payload, f.owner));
    assert.equal(entered, false);
  } finally {
    fs.opendirSync = original;
  }
});
test('unknown file, changed owner and changed runtime bytes never pass inventory', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.payload, 'extra.js'), 'unknown');
  assert.throws(() => verifiedResources(f.payload, f.owner));
  fs.unlinkSync(path.join(f.payload, 'extra.js'));
  fs.appendFileSync(path.join(f.owner, 'runtime-worker.cjs'), 'changed');
  assert.throws(() => verifiedResources(f.payload, f.owner));
});
for (const name of [
  '../outside.js',
  '/absolute.js',
  'node_modules/x:stream',
  'trailing.',
  'node_modules/../x',
])
  test('unsafe relative inventory: ' + name, (t) => {
    const f = fixture(t);
    f.metadata.files[name] = 'a'.repeat(64);
    f.save();
    assert.throws(() => verifiedResources(f.payload, f.owner));
  });
test('metadata source/version/owner and mandatory library identity are closed', (t) => {
  const f = fixture(t);
  for (const [key, bad] of [
    ['source', 'wrong'],
    ['sourceDirty', 'false'],
    ['version', '1.0.0'],
    ['product', 'other'],
  ]) {
    const old = f.metadata[key];
    f.metadata[key] = bad;
    f.save();
    assert.throws(() => verifiedResources(f.payload, f.owner));
    f.metadata[key] = old;
  }
  delete f.metadata.files['library/workbench/project.js'];
  f.save();
  assert.throws(() => verifiedResources(f.payload, f.owner));
});
test('memoized immutable-directory admission checks every ancestor once and preserves per-file descriptor checks', (t) => {
  const f = fixture(t),
    admit = createAncestorAdmission(),
    file = path.join(f.root, 'payload/index.html'),
    original = fs.lstatSync;
  let reads = 0;
  fs.lstatSync = function (...args) {
    reads++;
    return original.apply(this, args);
  };
  try {
    readRegular(file, 1024, admit);
    const first = reads;
    readRegular(file, 1024, admit);
    assert.ok(first > 1);
    assert.equal(reads - first, 1);
    fs.appendFileSync(file, 'more');
    assert.throws(() => readRegular(file, 1, admit));
  } finally {
    fs.lstatSync = original;
  }
});
test('pre-existing directory junction/symlink refused before first cached admission', (t) => {
  const f = fixture(t),
    alias = path.join(f.root, 'alias');
  fs.symlinkSync(f.payload, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => readRegular(path.join(alias, 'index.html'), 1024, createAncestorAdmission()));
});
