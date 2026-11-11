/**
 * @file Stage actual Node-RED production dependencies, original compiled nodes and the native editor.
 * @description No dependency executable is replaced by a demonstration; source/component integrity must be verified first.
 * @exports No public API; one fresh .runtime child is a build-only destination.
 * @data Every ordinary resource and fixed owner is hashed with explicit clean/dirty source identity.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { build } = require('../desktop/node_modules/esbuild');
const { readRegular, newFile } = require('../desktop/files.cjs');
const { OWNER, verifiedResources } = require('../desktop/resources.cjs');
const root = path.resolve(import.meta.dirname, '..'),
  output = path.resolve(process.argv[2] ?? path.join(root, '.runtime/native-resources'));
const dirtyAllowed = process.argv[3] === '--allow-dirty';
if (
  !output.startsWith(path.join(root, '.runtime') + path.sep) ||
  fs.existsSync(output) ||
  process.argv.length > 4 ||
  (process.argv[3] && !dirtyAllowed) ||
  (dirtyAllowed && process.env.GITHUB_ACTIONS === 'true')
)
  throw new Error('Use a fresh owned .runtime staging directory.');
const checked = (exe, args) =>
  execFileSync(exe, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
const git = (...args) =>
  checked('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args]).trim();
const source = git('rev-parse', 'HEAD'),
  sourceDirty = Boolean(git('status', '--porcelain'));
if (!/^[a-f0-9]{40}$/.test(source) || (sourceDirty && !dirtyAllowed))
  throw new Error('Use clean source or an explicit local dirty candidate.');
// The preparation helper owns the exact verified upstream/component lock. Never silently fetch during staging.
checked(process.env.METADATA_PYTHON ?? 'python', ['scripts/prepare-npm-component.py', '--verify']);
for (const file of ['package.json', 'desktop/package.json', 'native-runtime/package.json'])
  if (JSON.parse(readRegular(path.join(root, file), 1024 * 1024)).version !== '1.1.0')
    throw new Error('Product versions differ.');
checked(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json']);
checked(process.execPath, ['scripts/copy-editor.mjs']);
fs.mkdirSync(output, { recursive: true });
let copied = 0,
  total = 0;
/** Dependency installation is a trusted build input, but unexpected links still fail instead of expanding outside the lock. */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    if (item.name === '.bin') continue;
    const sourcePath = path.join(from, item.name),
      destination = path.join(to, item.name),
      actual = fs.lstatSync(sourcePath);
    if (actual.isSymbolicLink())
      throw new Error(
        'Install the locked private runtime with --install-links; build aliases are refused.',
      );
    if (actual.isDirectory()) copyTree(sourcePath, destination);
    else {
      if (
        ++copied > 30000 ||
        !actual.isFile() ||
        actual.size > 32 * 1024 * 1024 ||
        (total += actual.size) > 512 * 1024 * 1024
      )
        throw new Error('Native runtime exceeds its actual file/byte budget.');
      fs.copyFileSync(sourcePath, destination, fs.constants.COPYFILE_EXCL);
    }
  }
}
copyTree(path.join(root, 'native-runtime/node_modules'), path.join(output, 'node_modules'));
// Local file dependencies are ordinary packed files here. Verify the exact retained upstream core again after installation/copy.
const npmCore = JSON.parse(
  readRegular(path.join(root, 'native-installer/upstream-core.json'), 1024 * 1024),
);
for (const [name, expected] of Object.entries(npmCore)) {
  if (name === 'package.json') continue; // The disclosed variant manifest is verified separately below.
  const bytes = readRegular(path.join(output, 'node_modules/npm', name), 32 * 1024 * 1024);
  if (
    bytes.length !== expected.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== expected.sha256
  )
    throw new Error(
      'Installed npm core differs from the independently verified upstream inventory.',
    );
}
if (
  !readRegular(path.join(output, 'node_modules/npm/package.json'), 1024 * 1024).equals(
    readRegular(path.join(root, 'native-installer/source/package.json'), 1024 * 1024),
  )
)
  throw new Error('Installed npm variant manifest differs.');
copyTree(path.join(root, 'dist'), path.join(output, 'library'));
newFile(
  path.join(output, 'runtime-package.json'),
  JSON.stringify({ name: 'metadata-owned-runtime', private: true, version: '1.1.0' }) + '\n',
);
await build({
  bundle: true,
  platform: 'browser',
  target: 'chrome144',
  entryPoints: [path.join(root, 'desktop/ui/app.ts')],
  outfile: path.join(output, 'app.js'),
  legalComments: 'eof',
});
for (const name of ['index.html', 'style.css'])
  fs.copyFileSync(
    path.join(root, 'desktop/ui', name),
    path.join(output, name),
    fs.constants.COPYFILE_EXCL,
  );
const notices = [
  'Node-RED Metadata Workbench | Jason Stys\n',
  readRegular(path.join(root, 'LICENSE'), 1024 * 1024).toString('utf8'),
  '\nThe copied production dependency tree retains its supplied license, notice, README and package metadata files. The npm component is explicitly 12.2.2+workbench.1 with unchanged upstream core and a separately pinned dependency manifest/lock.\n',
];
const files = {};
let count = 0;
function inventory(directory, prefix = '') {
  for (const item of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const name = prefix + item.name,
      actual = path.join(directory, item.name);
    if (item.isDirectory()) {
      inventory(actual, name + '/');
      continue;
    }
    if (++count > 30000) throw new Error('Inventory count exceeded.');
    const bytes = readRegular(actual, 32 * 1024 * 1024);
    files[name] = createHash('sha256').update(bytes).digest('hex');
    if (
      prefix.startsWith('node_modules/') &&
      /^(?:licen[sc]e|copying|notice)(?:[.-].*)?$/iu.test(item.name)
    ) {
      if (bytes.length > 1024 * 1024) throw new Error('Dependency notice exceeds its budget.');
      notices.push('\n=== ' + name + ' ===\n', bytes.toString('utf8'));
    }
  }
}
inventory(output);
newFile(path.join(output, 'BUNDLED-NOTICES.txt'), notices.join('\n'));
files['BUNDLED-NOTICES.txt'] = createHash('sha256')
  .update(readRegular(path.join(output, 'BUNDLED-NOTICES.txt'), 32 * 1024 * 1024))
  .digest('hex');
const metadata = {
  schema: 1,
  product: 'node-red-resilient-metadata',
  version: '1.1.0',
  source,
  sourceDirty,
  files,
  owner: Object.fromEntries(
    OWNER.map((name) => [
      name,
      createHash('sha256')
        .update(readRegular(path.join(root, 'desktop', name), 32 * 1024 * 1024))
        .digest('hex'),
    ]),
  ),
};
newFile(path.join(output, 'SOURCE.json'), JSON.stringify(metadata, null, 2) + '\n');
verifiedResources(output, path.join(root, 'desktop'));
console.log(
  JSON.stringify({
    staged: true,
    source,
    sourceDirty,
    files: Object.keys(files).length,
    dependencyFiles: copied,
    dependencyBytes: total,
  }),
);
