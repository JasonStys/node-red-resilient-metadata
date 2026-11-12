/**
 * @file Actual nested dependency/core fixtures prevent a shallow or version-only development audit false pass.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { createHash } = require('node:crypto');
const api = import('../../scripts/verify-physical-runtime.mjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-physical-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  return root;
}
function pkg(root, name, version, extra = {}) {
  const file = path.join(root, name);
  fs.mkdirSync(file, { recursive: true });
  fs.writeFileSync(path.join(file, 'package.json'), JSON.stringify({ name, version, ...extra }));
  return file;
}
test('independent actual nested roots catch affected bundled leaves even below an innocently versioned package', async (t) => {
  const { inspectPackages } = await api,
    root = fixture(t),
    modules = path.join(root, 'node_modules'),
    parent = pkg(modules, 'parent', '1.0.0');
  pkg(path.join(parent, 'node_modules'), 'glob', '13.0.6');
  assert.throws(() => inspectPackages(modules, root), /affected/);
});
test('opaque bundled manifest is rejected before claiming graph completeness', async (t) => {
  const { inspectPackages } = await api,
    root = fixture(t);
  pkg(path.join(root, 'node_modules'), 'installer', '12.2.2', { bundleDependencies: ['glob'] });
  assert.throws(() => inspectPackages(path.join(root, 'node_modules'), root), /bundled/);
});
test('valid old unaffected plus fixed new matching versions are enumerated at every actual nested scope', async (t) => {
  const { inspectPackages } = await api,
    root = fixture(t),
    modules = path.join(root, 'node_modules'),
    parent = pkg(modules, '@scope/parent', '1.0.0');
  pkg(modules, 'glob', '7.2.3');
  pkg(path.join(parent, 'node_modules'), 'glob', '14.0.2');
  pkg(path.join(parent, 'node_modules'), 'minimatch', '11.0.5');
  assert.deepEqual(
    inspectPackages(modules, root)
      .filter((item) => item.name === 'glob')
      .map((item) => item.version)
      .sort(),
    ['14.0.2', '7.2.3'],
  );
});
test('real core bytes, not just a matching manifest version, must agree', async (t) => {
  const { verifyCore } = await api,
    root = fixture(t),
    manifest = { name: 'npm', version: '12.2.2+workbench.1' },
    bytes = Buffer.from('actual inert core');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(root, 'index.js'), bytes);
  const expected = {
    'index.js': { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
  };
  verifyCore(root, manifest, expected);
  fs.writeFileSync(path.join(root, 'index.js'), 'wrong bytes');
  assert.throws(() => verifyCore(root, manifest, expected), /differs/);
});
test('specific advisory boundaries reject prerelease ambiguity and preserve independently expected fixes', async () => {
  const { matchingVersionSafe } = await api;
  for (const [name, version, safe] of [
    ['glob', '9.0.0', false],
    ['glob', '14.0.1', false],
    ['glob', '14.0.2', true],
    ['minimatch', '7.0.0', false],
    ['minimatch', '11.0.0', false],
    ['minimatch', '11.0.1', true],
  ])
    assert.equal(matchingVersionSafe(name, version), safe);
  assert.throws(() => matchingVersionSafe('glob', '14.0.2-rc.1'));
});
test('the actual lock identity set covers normal/scoped packages and only the reviewed local npm component', async () => {
  const { pnpmVersions } = await api;
  const values = pnpmVersions(
    "lockfileVersion: '9.0'\npackages:\n  '@scope/item@1.2.3':\n    resolution: {integrity: sha512-example}\n  npm@file:native-installer/npm-12.2.2-workbench.1.tar:\n    resolution: {type: directory}\nsnapshots:\n",
    '12.2.2+workbench.1',
  );
  assert.deepEqual([...values].sort(), ['@scope/item@1.2.3', 'npm@12.2.2+workbench.1']);
});
test('unreviewed alias/file/format resolutions fail rather than disappearing from physical coverage', async () => {
  const { pnpmVersions } = await api;
  for (const entry of [
    'npm@file:../elsewhere:',
    "'@scope/item@npm:other@1.0.0':",
    'bad:',
    'unsupported without colon',
  ])
    assert.throws(() =>
      pnpmVersions(
        "lockfileVersion: '9.0'\npackages:\n" + '  ' + entry + '\nsnapshots:\n',
        '12.2.2+workbench.1',
      ),
    );
});
test('a stale extraneous package outside the two target matching libraries also fails the audited-lock membership check', async () => {
  const { verifyVersions } = await api;
  assert.throws(() =>
    verifyVersions([{ name: 'undici', version: '6.29.0' }], new Set(['undici@6.29.1'])),
  );
  verifyVersions([{ name: 'undici', version: '6.29.1' }], new Set(['undici@6.29.1']));
});
