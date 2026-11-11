/**
 * @file Independently inspect actual installed package roots, including nested/bundled leaves, rather than trusting one audit graph.
 * @description Verify the original registry resolves the disclosed unchanged npm core and patched matching libraries.
 * @exports inspectPackages, verifyCore and matchingVersionSafe for real filesystem regressions.
 * @data Read-only bounded package metadata; cached/unreachable store copies and arbitrary vendor JavaScript are not a universal security certification.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
/** Known package-manager hardlinks are read-only inputs. Byte/type/identity checks still bind one descriptor. */
function read(file, maximum = 1024 * 1024) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0),
  );
  try {
    const named = fs.lstatSync(file),
      actual = fs.fstatSync(fd);
    if (
      named.isSymbolicLink() ||
      !actual.isFile() ||
      actual.size > maximum ||
      actual.dev !== named.dev ||
      actual.ino !== named.ino ||
      actual.size !== named.size
    )
      throw new Error('Installed metadata identity/budget differs.');
    const bytes = Buffer.alloc(Math.min(actual.size + 1, maximum + 1));
    let count = 0;
    while (count < bytes.length) {
      const n = fs.readSync(fd, bytes, count, bytes.length - count, null);
      if (!n) break;
      count += n;
    }
    if (count !== actual.size || count > maximum) throw new Error('Installed bytes changed.');
    return bytes.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}
export function matchingVersionSafe(name, version) {
  const numbers = /^(\d+)\.(\d+)\.(\d+)(?:\+[A-Za-z0-9.-]+)?$/u.exec(version);
  if (!numbers) throw new Error('A stable exact matching-library version is required.');
  const [major, minor, patch] = numbers.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger))
    throw new Error('Ambiguous matching-library version.');
  return name === 'glob'
    ? major < 9 || major > 14 || (major === 14 && (minor > 0 || patch >= 2))
    : name === 'minimatch'
      ? major < 7 || major > 11 || (major === 11 && (minor > 0 || patch >= 1))
      : false;
}
/** Traverse actual Node resolution roots only, including every nested node_modules; never package example/fixture manifests. */
export function inspectPackages(directory, allowedRoot = path.dirname(directory)) {
  const records = [],
    visited = new Set();
  let entries = 0;
  function ordinary(file) {
    const real = fs.realpathSync(file),
      relative = path.relative(allowedRoot, real);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
      throw new Error('Installed module escaped the owned project.');
    return real;
  }
  function names(folder) {
    const handle = fs.opendirSync(folder),
      result = [];
    try {
      let entry;
      while ((entry = handle.readSync()) !== null) {
        if (++entries > 12000) throw new Error('Installed package entry budget exceeded.');
        if (!entry.name.startsWith('.')) result.push(entry.name);
      }
    } finally {
      handle.closeSync();
    }
    return result;
  }
  function module(folder) {
    const real = ordinary(folder);
    if (visited.has(real)) return;
    visited.add(real);
    if (records.length >= 3000) throw new Error('Installed package count exceeded.');
    const metadata = JSON.parse(read(path.join(real, 'package.json')).toString('utf8'));
    if (typeof metadata.name !== 'string' || typeof metadata.version !== 'string')
      throw new Error('Installed package identity is missing.');
    const bundled = metadata.bundleDependencies ?? metadata.bundledDependencies;
    if (bundled && (!Array.isArray(bundled) || bundled.length))
      throw new Error('Opaque bundled dependencies remain in the installed graph.');
    if (
      ['glob', 'minimatch'].includes(metadata.name) &&
      !matchingVersionSafe(metadata.name, metadata.version)
    )
      throw new Error('Installed matching library is in a known affected advisory range.');
    records.push({ name: metadata.name, version: metadata.version });
    const nested = path.join(real, 'node_modules');
    if (fs.existsSync(nested)) walk(nested);
  }
  function walk(folder) {
    const real = ordinary(folder);
    for (const name of names(real)) {
      const member = path.join(real, name);
      if (!fs.statSync(member).isDirectory()) continue;
      if (name.startsWith('@')) {
        for (const child of names(member)) module(path.join(member, child));
      } else module(member);
    }
  }
  walk(directory);
  return records;
}
export function verifyCore(directory, manifest, inventory) {
  assert.deepEqual(
    JSON.parse(read(path.join(directory, 'package.json')).toString('utf8')),
    manifest,
  );
  for (const [name, expected] of Object.entries(inventory)) {
    if (name === 'package.json') continue;
    if (
      name.startsWith('/') ||
      name.split('/').some((part) => !part || part === '..' || part === '.') ||
      name.includes('\\')
    )
      throw new Error('Unsafe expected core path.');
    const bytes = read(path.join(directory, name), 32 * 1024 * 1024);
    if (
      bytes.length !== expected.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== expected.sha256
    )
      throw new Error('Installed original npm core differs.');
  }
}
/** Deliberately closed pnpm11 lock-format contract, not a general YAML parser; unfamiliar/aliased entries require review. */
export function pnpmVersions(text, componentVersion) {
  const start = text.indexOf('\npackages:\n'),
    end = text.indexOf('\nsnapshots:\n');
  if (start < 0 || end <= start) throw new Error('Expected pnpm11 package/snapshot sections.');
  const expected = new Set();
  for (const line of text.slice(start + 11, end).split('\n')) {
    if (!line.startsWith('  ') || line[2] === ' ' || line.trim() === '') continue;
    if (!line.endsWith(':')) throw new Error('Unknown pnpm package declaration.');
    let declaration = line.slice(2, -1);
    if (declaration.startsWith("'")) {
      if (!declaration.endsWith("'")) throw new Error('Unknown pnpm quoted declaration.');
      declaration = declaration.slice(1, -1);
    }
    const at = declaration.lastIndexOf('@'),
      name = declaration.slice(0, at),
      version = declaration.slice(at + 1);
    if (
      !name ||
      at < 1 ||
      !/^(?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+$/u.test(name) ||
      /[\s'"\\]/u.test(declaration)
    )
      throw new Error('Unknown pnpm package identity.');
    if (declaration === 'npm@file:native-installer/npm-12.2.2-workbench.1.tar')
      expected.add('npm@' + componentVersion);
    else {
      if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/u.test(version))
        throw new Error('Unknown pnpm resolution/version.');
      expected.add(name + '@' + version);
    }
  }
  if (!expected.size) throw new Error('Empty pnpm physical package contract.');
  return expected;
}
export function verifyVersions(records, expected) {
  for (const item of records)
    if (!expected.has(item.name + '@' + item.version))
      throw new Error('An installed package/version is absent from the audited frozen lock.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'development';
  if (!['development', 'native'].includes(mode) || process.argv.length > 3)
    throw new Error('Choose the fixed development or native graph.');
  const base = mode === 'development' ? root : path.join(root, 'native-runtime'),
    require = createRequire(path.join(base, 'package.json'));
  const registry = createRequire(require.resolve('@node-red/registry/package.json')),
    npm = path.dirname(registry.resolve('npm/package.json'));
  const manifest = JSON.parse(read(path.join(root, 'native-installer/component-package.json'))),
    inventory = JSON.parse(read(path.join(root, 'native-installer/upstream-core.json')));
  verifyCore(npm, manifest, inventory);
  const records = inspectPackages(path.join(base, 'node_modules'), root);
  let expected;
  if (mode === 'development')
    expected = pnpmVersions(
      read(path.join(root, 'pnpm-lock.yaml'), 4 * 1024 * 1024).toString('utf8'),
      manifest.version,
    );
  else {
    const lock = JSON.parse(read(path.join(base, 'package-lock.json'), 4 * 1024 * 1024));
    expected = new Set(
      Object.entries(lock.packages)
        .filter(([name]) => name.includes('node_modules/'))
        .map(
          ([name, item]) =>
            (item.name ?? name.slice(name.lastIndexOf('node_modules/') + 13)) + '@' + item.version,
        ),
    );
  }
  verifyVersions(records, expected);
  if (
    require('node-red/package.json').version !== '5.0.8' ||
    JSON.parse(read(path.join(npm, 'package.json'))).version !== '12.2.2+workbench.1'
  )
    throw new Error('Original Node-RED/installer identity differs.');
  console.log(
    JSON.stringify({
      passed: true,
      mode,
      nodeRed: '5.0.8',
      npmVariant: manifest.version,
      originalNonManifestCoreFiles: Object.keys(inventory).filter((name) => name !== 'package.json')
        .length,
      actualPackageRoots: records.length,
      opaqueBundles: 0,
      matchingLibraries: records.filter((item) => ['glob', 'minimatch'].includes(item.name)),
      scope:
        'Actual installed resolution roots and two specific advisory ranges; run the full locked advisory audit separately.',
    }),
  );
}
