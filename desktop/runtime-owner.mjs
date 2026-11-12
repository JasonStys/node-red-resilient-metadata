/**
 * @file Own one actual Node-RED child and its transient directory until real process exit.
 * @description No forced kill, reused listener, inherited proxy/credential or guessed successful shutdown.
 * @exports startRuntime.
 * @data Fixed verified source/resource paths and minimal per-child environment are never renderer inputs.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import { utilityProcess } from 'electron';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
const require = createRequire(import.meta.url);
const { createChannel } = require('./runtime-channel.cjs');
export async function startRuntime(ownerRoot, resourceRoot, progress) {
  const directory = await mkdtemp(join(tmpdir(), 'metadata-native-runtime-'));
  const nonce = randomBytes(32).toString('hex');
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'COMSPEC'])
    if (typeof process.env[name] === 'string') environment[name] = process.env[name];
  Object.assign(environment, {
    TEMP: directory,
    TMP: directory,
    HOME: directory,
    USERPROFILE: directory,
    NODE_RED_DISABLE_TELEMETRY: '1',
    NODE_USE_ENV_PROXY: '0',
    PATH: [
      dirname(process.execPath),
      ...(process.platform === 'win32'
        ? [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')]
        : []),
    ].join(delimiter),
  });
  let child;
  // Windows utility-process cwd can retain the temporary directory after the exit event.
  // The fixed verified resource directory is never deleted; all mutable runtime paths remain explicit below directory.
  try {
    child = utilityProcess.fork(
      join(ownerRoot, 'runtime-worker.cjs'),
      [resourceRoot, directory, nonce],
      {
        cwd: resourceRoot,
        execArgv: [],
        env: environment,
        stdio: 'pipe',
        serviceName: 'Owned metadata integration runtime',
      },
    );
  } catch (error) {
    await rm(directory, { recursive: true });
    throw error;
  }
  // Drain private diagnostics without recording source records, credentials or personal paths.
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', () => {});
  const channel = createChannel(child, nonce, progress);
  child.on('message', (value) => {
    if (['closed', 'fatal'].includes(value?.type))
      console.info('metadata-runtime-stage', value.type, value.success === true);
  });
  child.on('exit', (code) => {
    console.info('metadata-runtime-stage', 'actual-exit', code);
  });
  let closing;
  return {
    ready: channel.ready,
    exited: channel.exited,
    request: channel.request,
    close() {
      if (!closing)
        closing = (async () => {
          const result = await channel.close();
          console.info('metadata-runtime-stage', 'closure-and-exit-proven');
          try {
            await rm(directory, { recursive: true });
          } catch (error) {
            console.info(
              'metadata-runtime-stage',
              'transient-removal-failed',
              error.code ?? error.name,
            );
            throw error;
          }
          console.info('metadata-runtime-stage', 'transient-removed');
          return result;
        })();
      return closing;
    },
    get pid() {
      return child.pid;
    },
  };
}
