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
test('the actual pinned builder copies root and nested dependencies only with the explicit dependency-root entry', async (t) => {
  const { nativeResourceEntries } = await import('../../scripts/compare-native-source.mjs');
  const {
    getFileMatchers,
    copyFiles,
  } = require('../node_modules/app-builder-lib/out/fileMatcher.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-builder-copy-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const site = path.join(root, 'site');
  const files = {
    'library/workbench/project.js': '// inert original node fixture',
    'node_modules/node-red/package.json': '{"name":"node-red","version":"5.0.8"}',
    'node_modules/npm/LICENSE': 'actual copy fixture terms',
    'node_modules/@scope/parent/node_modules/child/LICENSE': 'nested terms must remain',
    'node_modules/@scope/parent/.ordinary-dot-file': 'dot member remains',
  };
  for (const [name, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(site, name)), { recursive: true });
    fs.writeFileSync(path.join(site, name), data);
  }
  async function copy(entries, destination) {
    const matchers = getFileMatchers({ extraResources: entries }, 'extraResources', destination, {
      defaultSrc: root,
      globalOutDir: destination,
      customBuildOptions: {},
      macroExpander: (value) => value,
    });
    await copyFiles(matchers);
  }
  const omitted = path.join(root, 'old'),
    preserved = path.join(root, 'new');
  await copy([{ from: site, to: 'workbench' }], omitted);
  assert.equal(fs.existsSync(path.join(omitted, 'workbench/node_modules')), false);
  await copy(nativeResourceEntries(site), preserved);
  for (const [name, data] of Object.entries(files))
    assert.equal(fs.readFileSync(path.join(preserved, 'workbench', name), 'utf8'), data);
});
