/**
 * @file Real updater-style tracked-TAR resolution, missing-checkout-file and integrity regressions.
 * @remarks Uses an owned network tripwire and inert packages only; exact production source bytes are checked separately. Declaration locations: docs/code-map.md.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const COMPONENT_FILE = 'native-installer/npm-12.2.2-workbench.1.tar';

/** Independently create ordinary USTAR bytes for one inert package, without using the production packer. */
function inertTar(manifest = null) {
  const files = {
    'package/package.json': Buffer.from(
      JSON.stringify(
        manifest ?? {
          name: 'updater-probe',
          version: '1.0.0',
          scripts: {
            install:
              "node -e \"require('fs').writeFileSync(process.env.UPDATER_LIFECYCLE_TRIPWIRE,'bad')\"",
          },
        },
      ),
    ),
    'package/README.md': Buffer.from('inert updater transport fixture\n'),
  };
  const blocks = [];
  for (const [name, bytes] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'ascii');
    for (const [offset, length, value] of [
      [100, 8, 0o644],
      [108, 8, 0],
      [116, 8, 0],
      [124, 12, bytes.length],
      [136, 12, 0],
    ])
      header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
    header.fill(32, 148, 156);
    header.write('0', 156, 'ascii');
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');
    const checksum = header.reduce((total, byte) => total + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    blocks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

/** Run the actual declared pnpm tool, with bounded output/deadline and isolated credentials/cache. */
function pnpm(command, cwd, configuration) {
  const cli = process.env.npm_execpath;
  assert.equal(typeof cli, 'string', 'Run via the declared pnpm test:updater-sources command.');
  assert.match(path.basename(cli), /^pnpm\.[cm]?js$/u);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].includes(
        name,
      ),
    ),
  );
  Object.assign(env, {
    CI: 'true',
    NO_COLOR: '1',
    COREPACK_ENABLE_NETWORK: '0',
    npm_config_userconfig: path.join(configuration, 'empty.npmrc'),
    npm_config_cache: path.join(configuration, 'npm-cache'),
    LOCALAPPDATA: path.join(configuration, 'local-data'),
    APPDATA: path.join(configuration, 'roaming-data'),
    USERPROFILE: path.join(configuration, 'profile'),
    XDG_CONFIG_HOME: path.join(configuration, 'config'),
    XDG_CACHE_HOME: path.join(configuration, 'cache'),
    UPDATER_LIFECYCLE_TRIPWIRE: path.join(path.dirname(configuration), 'DO_NOT_EXECUTE'),
  });
  fs.mkdirSync(configuration, { recursive: true });
  fs.writeFileSync(env.npm_config_userconfig, '');
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [cli, ...command],
      { cwd, env, windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024 },
      (error, stdout, stderr) => {
        if (error && (error.killed || error.signal || typeof error.code !== 'number'))
          reject(error);
        else resolve({ code: error?.code ?? 0, stdout, stderr });
      },
    );
  });
}

test('cold checkout contains the exact component input while original locators and exotic-source guard remain intact', () => {
  const pin = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'native-installer/upstream.json')),
  ).componentArchive;
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'native-runtime/package.json')));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'native-runtime/package-lock.json')));
  const pnpmLock = fs.readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8');
  const workspace = fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  const bytes = fs.readFileSync(path.join(ROOT, COMPONENT_FILE));
  assert.equal(pin.sha256, 'f94f6483388a8653fcc04ab0ce36b8b932ddc687a50bdc30bf9b2fbba4fb7184');
  assert.equal(bytes.length, 3717120);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256);
  assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), pin.integrity);
  assert.equal(manifest.dependencies.npm, 'file:../' + COMPONENT_FILE);
  assert.equal(lock.packages[''].dependencies.npm, manifest.dependencies.npm);
  assert.equal(lock.packages['node_modules/npm'].resolved, manifest.dependencies.npm);
  assert.equal(lock.packages['node_modules/npm'].integrity, pin.integrity);
  assert.equal(lock.packages['node_modules/npm'].version, '12.2.2+workbench.1');
  assert.ok(workspace.includes("'npm@11.21.0': file:./" + COMPONENT_FILE));
  assert.ok(pnpmLock.includes('integrity: ' + pin.integrity + ', tarball: file:' + COMPONENT_FILE));
  assert.doesNotMatch(ignore, /^native-installer\/npm-12\.2\.2-workbench\.1\.tar$/mu);
  assert.doesNotMatch(workspace, /blockExoticSubdeps:\s*false/u);
});

/** Read only the held fixture descriptor, including an extra-byte bound; never reopen by a prior stat pathname. */
function heldBytes(descriptor, length) {
  const bytes = Buffer.alloc(length + 1);
  let count = 0;
  while (count < bytes.length) {
    const size = fs.readSync(descriptor, bytes, count, bytes.length - count, count);
    if (!size) break;
    count += size;
  }
  assert.equal(count, length);
  assert.equal(fs.fstatSync(descriptor).size, length);
  return bytes.subarray(0, count);
}

test('actual updater cold checkout refresh needs its tracked TAR and refuses changed bytes without running scripts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-updater-'));
  const body = inertTar();
  const sri = 'sha512-' + createHash('sha512').update(body).digest('base64');
  let requests = 0;
  const descriptors = [];
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.writeHead(503);
    response.end('No registry request is permitted in this fixture.');
  });
  t.after(async () => {
    for (const descriptor of descriptors) fs.closeSync(descriptor);
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    assert.ok(root.startsWith(os.tmpdir() + path.sep));
    fs.rmSync(root, { recursive: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
  });
  const project = path.join(root, 'updater-checkout');
  fs.mkdirSync(project);
  fs.writeFileSync(
    path.join(project, '.npmrc'),
    `registry=http://127.0.0.1:${server.address().port}/tripwire\nfetch-retries=0\nupdate-notifier=false\nmanage-package-manager-versions=false\n`,
  );
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({
      name: 'inert-updater-source-check',
      version: '1.0.0',
      private: true,
      dependencies: { 'updater-parent': 'file:parent.tar' },
    }),
  );
  fs.writeFileSync(
    path.join(project, 'parent.tar'),
    inertTar({
      name: 'updater-parent',
      version: '1.0.0',
      dependencies: { 'updater-probe': '1.0.0' },
    }),
  );
  fs.writeFileSync(
    path.join(project, 'pnpm-workspace.yaml'),
    "blockExoticSubdeps: true\noverrides:\n  'updater-probe@1.0.0': file:component.tar\n",
  );
  const version = await pnpm(['--version'], project, path.join(root, 'version-config'));
  assert.equal(version.code, 0, version.stderr);
  assert.equal(version.stdout.trim(), '11.19.0');
  const command = [
    'update',
    '--lockfile-only',
    '--ignore-scripts',
    '--fetch-retries=0',
    '--store-dir',
  ];
  const old = await pnpm(
    [...command, path.join(root, 'missing-store')],
    project,
    path.join(root, 'old-config'),
  );
  assert.notEqual(old.code, 0);
  assert.match(old.stdout + old.stderr, /ENOENT/u);
  assert.match(old.stdout + old.stderr, /component\.tar/u);
  const component = path.join(project, 'component.tar');
  const descriptor = fs.openSync(component, 'wx+');
  descriptors.push(descriptor);
  fs.writeFileSync(descriptor, body);
  fs.fsyncSync(descriptor);
  const before = fs.fstatSync(descriptor);
  const replacement = await pnpm(
    [...command, path.join(root, 'tracked-store')],
    project,
    path.join(root, 'new-config'),
  );
  assert.equal(replacement.code, 0, replacement.stdout + replacement.stderr);
  const lock = fs.readFileSync(path.join(project, 'pnpm-lock.yaml'), 'utf8');
  assert.ok(lock.includes(sri) && lock.includes('file:component.tar'));
  assert.equal(fs.existsSync(path.join(project, 'node_modules')), false);
  assert.deepEqual(heldBytes(descriptor, body.length), body);
  assert.equal(fs.fstatSync(descriptor).mtimeMs, before.mtimeMs);
  const frozen = [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--fetch-retries=0',
    '--store-dir',
  ];
  const coherent = await pnpm(
    [...frozen, path.join(root, 'coherent-store')],
    project,
    path.join(root, 'coherent-config'),
  );
  let diagnostic = null;
  if (coherent.code !== 0) {
    const witness = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [
          '-e',
          "console.log(JSON.stringify({cwd:process.cwd(),canonical:require('node:fs').realpathSync('.'),node:process.version}))",
        ],
        { cwd: project, windowsHide: true, timeout: 5000, maxBuffer: 8192 },
        (error, stdout, stderr) => resolve({ error: error?.code ?? null, stdout, stderr }),
      );
    });
    diagnostic = {
      stage: 'positive-frozen-countercontrol',
      requestedProject: project,
      canonicalProject: fs.realpathSync(project),
      sourceDirectory: ROOT,
      sourceDrive: path.parse(ROOT).root,
      fixtureDrive: path.parse(project).root,
      node: process.version,
      pnpmVersion: version.stdout.trim(),
      pnpmEntrypoint: process.env.npm_execpath,
      childWitness: witness,
      inertManifest: JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8')),
      inertLock: lock.slice(0, 8192),
      explicitFixtureConfig: fs.readFileSync(path.join(project, '.npmrc'), 'utf8').slice(0, 1024),
      explicitWorkspace: fs
        .readFileSync(path.join(project, 'pnpm-workspace.yaml'), 'utf8')
        .slice(0, 1024),
    };
  }
  assert.equal(
    coherent.code,
    0,
    JSON.stringify({ diagnostic, stdout: coherent.stdout, stderr: coherent.stderr }),
  );
  assert.deepEqual(heldBytes(descriptor, body.length), body);
  // A fresh checkout prevents an already installed module or store from hiding changed input.
  const tampered = path.join(root, 'tampered-checkout');
  fs.mkdirSync(tampered);
  for (const name of [
    '.npmrc',
    'package.json',
    'parent.tar',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
  ])
    fs.writeFileSync(path.join(tampered, name), fs.readFileSync(path.join(project, name)), {
      flag: 'wx',
    });
  const changedBytes = Buffer.from(body);
  const changedAt = body.indexOf('inert updater transport fixture');
  assert.ok(changedAt >= 0);
  changedBytes[changedAt] ^= 1;
  const changedDescriptor = fs.openSync(path.join(tampered, 'component.tar'), 'wx+');
  descriptors.push(changedDescriptor);
  fs.writeFileSync(changedDescriptor, changedBytes);
  fs.fsyncSync(changedDescriptor);
  const changed = await pnpm(
    [...frozen, path.join(root, 'tampered-store')],
    tampered,
    path.join(root, 'tampered-config'),
  );
  assert.notEqual(changed.code, 0);
  assert.match(changed.stdout + changed.stderr, /ERR_PNPM_TARBALL_INTEGRITY/u);
  assert.deepEqual(heldBytes(changedDescriptor, changedBytes.length), changedBytes);
  assert.deepEqual(heldBytes(descriptor, body.length), body);
  assert.equal(fs.existsSync(path.join(root, 'DO_NOT_EXECUTE')), false);
  assert.equal(
    requests,
    0,
    'Cold local source resolution must not fetch a registry or remote URL.',
  );
});
