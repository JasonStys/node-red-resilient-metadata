/**
 * @file Real native inventory-copy boundary regressions.
 * @description Exercise the actual build helper with ordinary large inputs, changed bytes and the retained eight-MiB ceiling.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { OWNER, verifiedResources } = require('../resources.cjs');

function sourceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-builder-copy-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const site = path.join(root, 'site'),
    owner = path.join(root, 'owner');
  fs.mkdirSync(site);
  fs.mkdirSync(owner);
  const files = {
    'index.html': '<!doctype html><title>Inert fixture</title>',
    'app.js': '// inert UI',
    'style.css': 'body {}',
    'runtime-package.json': '{}',
    'BUNDLED-NOTICES.txt': 'inert terms',
    'library/workbench/project.js': '// inert original node fixture',
    'node_modules/node-red/package.json': '{"name":"node-red","version":"5.0.8"}',
    'node_modules/npm/package.json': '{"name":"npm","version":"12.2.2+workbench.1"}',
    'node_modules/npm/LICENSE': 'actual copy fixture terms',
    'node_modules/@scope/parent/node_modules/child/LICENSE': 'nested terms must remain',
    'node_modules/@scope/parent/.ordinary-dot-file': 'dot member remains',
    'node_modules/npm/node_modules/undici/lib/llhttp/.gitkeep': '',
    '.gitkeep': 'even a root marker must remain exact',
    '.DS_Store': 'inert upstream bytes',
  };
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const owners = {};
  for (const name of OWNER) {
    const data = '// inert owner ' + name;
    fs.writeFileSync(path.join(owner, name), data);
    owners[name] = digest(data);
  }
  for (const [name, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(site, name)), { recursive: true });
    fs.writeFileSync(path.join(site, name), data);
  }
  const metadata = {
    schema: 1,
    product: 'node-red-resilient-metadata',
    version: '1.1.0',
    source: 'a'.repeat(40),
    sourceDirty: true,
    owner: owners,
    files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, digest(data)])),
  };
  fs.writeFileSync(path.join(site, 'SOURCE.json'), JSON.stringify(metadata));
  return { root, site, owner, files, metadata };
}
test('actual build comparison admits an exact inventory larger than 512 KiB and rejects a changed copy', async (t) => {
  const { compareNativeSource } = await import('../../scripts/compare-native-source.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-source-copy-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const original = path.join(root, 'original.json'),
    copied = path.join(root, 'copied.json');
  const bytes = Buffer.alloc(1283611, 32);
  fs.writeFileSync(original, bytes);
  fs.writeFileSync(copied, bytes);
  compareNativeSource(original, copied);
  bytes[bytes.length - 1] = 33;
  fs.writeFileSync(copied, bytes);
  assert.throws(() => compareNativeSource(original, copied), /not copied/);
});
test('the actual comparison retains its eight-MiB limit on both inputs', async (t) => {
  const { compareNativeSource } = await import('../../scripts/compare-native-source.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-source-cap-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const original = path.join(root, 'original.json'),
    copied = path.join(root, 'copied.json');
  fs.writeFileSync(original, Buffer.alloc(8 * 1024 * 1024 + 1));
  fs.writeFileSync(copied, '{}');
  assert.throws(() => compareNativeSource(original, copied), /identity/);
  assert.throws(() => compareNativeSource(copied, original), /identity/);
});
test('actual builder filters omit runtime/root marker files while the verified complete copier preserves every declared byte', async (t) => {
  const { copyNativeResources } = await import('../../scripts/compare-native-source.mjs');
  const {
    getFileMatchers,
    copyFiles,
  } = require('../node_modules/app-builder-lib/out/fileMatcher.js');
  const { root, site, owner, files } = sourceFixture(t);
  const omitted = path.join(root, 'old'),
    preserved = path.join(root, 'new');
  const matchers = getFileMatchers(
    { extraResources: [{ from: site, to: 'workbench' }] },
    'extraResources',
    omitted,
    {
      defaultSrc: root,
      globalOutDir: omitted,
      customBuildOptions: {},
      macroExpander: (value) => value,
    },
  );
  await copyFiles(matchers);
  assert.equal(fs.existsSync(path.join(omitted, 'workbench/node_modules')), false);
  assert.equal(fs.existsSync(path.join(omitted, 'workbench/.gitkeep')), false);
  copyNativeResources(site, preserved, owner);
  for (const [name, data] of Object.entries(files))
    assert.equal(fs.readFileSync(path.join(preserved, name), 'utf8'), data);
  assert.deepEqual(
    fs.readFileSync(path.join(preserved, 'SOURCE.json')),
    fs.readFileSync(path.join(site, 'SOURCE.json')),
  );
  verifiedResources(preserved, owner);
});
test('complete copying refuses an existing destination without touching its sentinel', async (t) => {
  const { copyNativeResources } = await import('../../scripts/compare-native-source.mjs');
  const { root, site, owner } = sourceFixture(t);
  const output = path.join(root, 'retained');
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, 'sentinel'), 'preserve exact bytes');
  assert.throws(() => copyNativeResources(site, output, owner), { code: 'EEXIST' });
  assert.deepEqual(fs.readdirSync(output), ['sentinel']);
  assert.equal(fs.readFileSync(path.join(output, 'sentinel'), 'utf8'), 'preserve exact bytes');
});
test('invalid declared paths or changed source bodies are refused before creating the destination', async (t) => {
  const { copyNativeResources } = await import('../../scripts/compare-native-source.mjs');
  const { root, site, owner, files, metadata } = sourceFixture(t);
  const output = path.join(root, 'refused');
  fs.writeFileSync(path.join(site, 'style.css'), 'changed body');
  assert.throws(() => copyNativeResources(site, output, owner));
  assert.equal(fs.existsSync(output), false);
  fs.writeFileSync(path.join(site, 'style.css'), files['style.css']);
  verifiedResources(site, owner); // Prove the first fault is fully repaired before the independent path fault.
  metadata.files['../outside.txt'] = '0'.repeat(64);
  fs.writeFileSync(path.join(site, 'SOURCE.json'), JSON.stringify(metadata));
  assert.throws(() => copyNativeResources(site, output, owner), /Unsafe packaged member/);
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(path.join(root, 'outside.txt')), false);
});
