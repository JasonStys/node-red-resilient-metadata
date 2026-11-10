/**
 * @file Actual installed-package consumer verification by Jason Stys.
 * @description Packs built production files, installs in an owned temporary prefix, and runs genuine Node-RED/HTTP acceptance.
 * @exports verifyInstalledConsumer; no product publication or global install.
 * @data archive and consumer identities are checked; npm credentials/scripts and source aliases are excluded.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import console from 'node:console';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Execute only an identified package-manager JS entrypoint with a bounded clean child environment. */
function command(cli, args, cwd, environment) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: environment,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error(
      `Installed consumer command failed: ${result.error ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  return result.stdout.trim();
}

/** Locate the npm JS CLI in the existing official Node distribution, never a shell/batch lookup. */
async function npmCli() {
  const candidates = [
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../node_modules/npm/bin/npm-cli.js'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* Try the other supported Node layout. */
    }
  }
  throw new Error('The Node distribution must provide its existing npm JS CLI');
}

/** Install only the final archive and exact reviewed runtime dependency, then test that physical consumer. */
export async function verifyInstalledConsumer() {
  const consumer = await realpath(await mkdtemp(join(tmpdir(), 'node-red-package-consumer-')));
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        typeof value === 'string' &&
        !/(?:TOKEN|PASSWORD|SECRET|CREDENTIAL|AUTH|COOKIE)|^NODE_OPTIONS$|^NODE_PATH$/iu.test(key),
    ),
  );
  environment.npm_config_ignore_scripts = 'true';
  environment.npm_config_cache = join(root, '.package-smoke/npm-cache');
  try {
    const manager = process.env.npm_execpath;
    assert.ok(
      manager && /pnpm\.(?:cjs|mjs|js)$/u.test(manager.replaceAll('\\', '/')),
      `Run through pnpm package:verify or pnpm verify (received ${manager ? basename(manager) : 'no manager'})`,
    );
    command(manager, ['pack', '--pack-destination', consumer], root, environment);
    const definition = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const filename = `${definition.name}-${definition.version}.tgz`;
    assert.ok(basename(filename) === filename && /^[a-z0-9._-]+\.tgz$/u.test(filename));
    const archive = join(consumer, filename);
    const archiveSha256 = createHash('sha256')
      .update(await readFile(archive))
      .digest('hex');
    await writeFile(
      join(consumer, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        dependencies: {
          [definition.name]: `file:${archive.replaceAll('\\', '/')}`,
        },
      }),
    );
    await writeFile(join(consumer, 'empty-user.npmrc'), '');
    await writeFile(join(consumer, 'empty-global.npmrc'), '');
    command(
      await npmCli(),
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--registry=https://registry.npmjs.org/',
        `--userconfig=${join(consumer, 'empty-user.npmrc')}`,
        `--globalconfig=${join(consumer, 'empty-global.npmrc')}`,
      ],
      consumer,
      environment,
    );
    const installed = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'));
    const lock = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8');
    const expectedZod = /^ {2}zod@4\.6\.7:\r?\n {4}resolution: \{integrity: ([^}]+)\}/mu.exec(
      lock,
    )?.[1];
    assert.ok(expectedZod, 'Reviewed Zod runtime integrity must exist');
    assert.equal(installed.packages['node_modules/zod'].version, definition.dependencies.zod);
    assert.equal(installed.packages['node_modules/zod'].integrity, expectedZod);
    await copyFile(
      join(root, 'tests/package/installed-node-red.mjs'),
      join(consumer, 'installed-node-red.mjs'),
    );
    // The child imports product code only through its own installed node-red.nodes manifest.
    const result = command(join(consumer, 'installed-node-red.mjs'), [root], consumer, environment);
    console.log(result);
    console.log(
      JSON.stringify({
        installedPackage: definition.name,
        version: definition.version,
        archiveSha256,
        zodIntegrityVerified: true,
        sourceAliases: false,
        publication: false,
      }),
    );
  } finally {
    assert.ok(
      consumer.startsWith((await realpath(tmpdir())) + sep) &&
        basename(consumer).startsWith('node-red-package-consumer-'),
    );
    await rm(consumer, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
