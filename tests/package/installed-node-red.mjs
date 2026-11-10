/**
 * @file Actual consumer-installed Node-RED flow acceptance by Jason Stys.
 * @description Runs the shipped CommonJS nodes in the locked official runtime helper with actual owned HTTP fixtures.
 * @exports No exports; copied into the isolated consumer and executed as a native Node process.
 * @data All credentials/records are synthetic; no global fetch replacement, source import or existing listener reuse.
 */
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { setTimeout as deadline, clearTimeout, setImmediate } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';

const consumer = await realpath(dirname(fileURLToPath(import.meta.url)));
const toolsRoot = await realpath(process.argv[2]);
assert.ok(consumer !== toolsRoot && !consumer.startsWith(toolsRoot + sep));
const consumerRequire = createRequire(join(consumer, 'package.json'));
const toolsRequire = createRequire(join(toolsRoot, 'package.json'));
const installedRoot = await realpath(
  join(consumer, 'node_modules/node-red-contrib-resilient-metadata'),
);
assert.ok(installedRoot.startsWith(consumer + sep) && !installedRoot.startsWith(toolsRoot + sep));
const definition = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8'));
assert.deepEqual(Object.keys(definition['node-red'].nodes).sort(), [
  'metadata-service',
  'resilient-metadata',
]);
const registrations = [];
for (const entry of Object.values(definition['node-red'].nodes)) {
  const target = await realpath(resolve(installedRoot, entry));
  assert.ok(target.startsWith(installedRoot + sep));
  const registration = consumerRequire(target);
  assert.equal(typeof registration, 'function');
  registrations.push(registration);
  await readFile(target.replace(/\.js$/u, '.html'), 'utf8');
}
for (const file of ['schemas/lookup-request.schema.json', 'schemas/metadata-record.schema.json'])
  JSON.parse(await readFile(join(installedRoot, file), 'utf8'));
const helper = toolsRequire('node-red-node-test-helper');
helper.init(toolsRequire.resolve('node-red'));
await mkdir(join(consumer, 'runtime-user'), { recursive: true });
helper.settings({
  userDir: join(consumer, 'runtime-user'),
  credentialSecret: 'synthetic-package-fixture-only',
});

/** Bound every wait by an absolute test deadline, including stalled native HTTP cancellation. */
async function bounded(promise, label, milliseconds = 5_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_done, reject) => {
        timer = deadline(
          () => reject(new Error(`Installed consumer deadline: ${label}`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The official helper owns only its ephemeral numeric-loopback server and in-memory flow fixture. */
function callback(register) {
  return bounded(
    new Promise((done, reject) => register((error) => (error ? reject(error) : done()))),
    'runtime lifecycle',
  );
}

const providerEvents = new EventEmitter();
let mode = 'success';
let requests = 0;
let protectedCredential = false;
let realPath = false;
const token = 'SYNTHETIC-PACKAGE-CONSUMER-TOKEN';
const record = {
  schemaVersion: '1.0',
  productId: 'drive-200',
  version: '2.4.1',
  displayName: 'Synthetic Drive 200',
  lifecycle: 'active',
  metadata: { family: 'motion' },
  sourceTimestamp: '2026-01-15T12:00:00.000Z',
  documentation: [{ title: 'Synthetic guide', url: 'https://docs.example.test/drive-200' }],
};
const provider = createServer((request, response) => {
  requests++;
  protectedCredential = request.headers.authorization === `Bearer ${token}`;
  const url = new URL(request.url, `http://${request.headers.host}`);
  realPath = request.method === 'GET' && url.pathname === '/v1/products/drive-200';
  if (mode === 'hold') {
    providerEvents.emit('held', response);
    return;
  }
  if (mode === 'auth') {
    response.writeHead(401);
    response.end();
    return;
  }
  if (mode === 'cooldown') {
    response.writeHead(503, { 'retry-after': '120' });
    response.end();
    return;
  }
  if (mode === 'retry' && requests === 1) {
    response.writeHead(429, { 'retry-after': '0' });
    response.end();
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(mode === 'invalid-response' ? { unrecognized: 'fixture' } : record));
});

/** Fresh real flow instance uses only installed registrations and synthetic protected credentials. */
async function flow(retryCount = 0, timeoutMs = 1_000) {
  requests = 0;
  const address = provider.address();
  assert.ok(address && typeof address !== 'string');
  await bounded(
    helper.load(
      registrations,
      [
        {
          id: 'service',
          type: 'metadata-service',
          baseUrl: `http://127.0.0.1:${address.port}`,
          timeoutMs,
          maxResponseBytes: 16_384,
          retryCount,
          retryDelayMs: 0,
          maxConcurrent: 2,
          maxQueueDepth: 4,
        },
        {
          id: 'lookup',
          type: 'resilient-metadata',
          service: 'service',
          requestProperty: 'payload',
          wires: [['success'], ['failure']],
        },
        { id: 'success', type: 'helper' },
        { id: 'failure', type: 'helper' },
      ],
      { service: { apiToken: token } },
    ),
    'load actual installed flow',
  );
}

/** Wait for a real routed message before assertions; no sleep/poll or fake fetch result. */
function message(node) {
  return bounded(
    once(helper.getNode(node), 'input').then(([value]) => value),
    'routed message',
  );
}
function send(id) {
  helper
    .getNode('lookup')
    .receive({ _msgid: id, payload: { productId: 'drive-200', version: '2.4.1' } });
}

let started = false;
const checks = [];
try {
  await bounded(
    new Promise((done, reject) => {
      provider.once('error', reject);
      provider.listen(0, '127.0.0.1', done);
    }),
    'owned provider bind',
  );
  await callback((done) => helper.startServer(done));
  started = true;
  await flow();
  let received = message('success');
  send('packed-success');
  const successful = await received;
  assert.equal(successful.payload.displayName, record.displayName);
  assert.equal(successful.metadataLookup.correlationId, 'packed-success');
  assert.equal(successful.metadataLookup.attempts, 1);
  assert.equal(protectedCredential, true);
  assert.equal(realPath, true);
  assert.equal(JSON.stringify(successful).includes(token), false);
  checks.push('actual installed flow success and credential-safe real HTTP');
  await helper.unload();
  await flow();
  received = message('failure');
  helper.getNode('lookup').receive({ _msgid: 'packed-invalid', payload: { productId: '' } });
  assert.equal((await received).metadataError.code, 'INVALID_INPUT');
  assert.equal(requests, 0);
  checks.push('invalid message rejects before network');
  await helper.unload();
  mode = 'auth';
  await flow();
  received = message('failure');
  send('packed-auth');
  assert.equal((await received).metadataError.code, 'AUTHENTICATION_FAILED');
  assert.equal(requests, 1);
  checks.push('actual HTTP401 structured route');
  await helper.unload();
  mode = 'retry';
  await flow(1);
  received = message('success');
  send('packed-retry');
  assert.equal((await received).metadataLookup.attempts, 2);
  assert.equal(requests, 2);
  checks.push('actual HTTP429 retry then success');
  await helper.unload();
  mode = 'cooldown';
  await flow(2);
  received = message('failure');
  send('packed-cooldown');
  const cooldown = (await received).metadataError;
  assert.equal(cooldown.code, 'HTTP_ERROR');
  assert.equal(cooldown.retriable, false);
  assert.equal(cooldown.details.retryAfterExceedsLimit, true);
  assert.equal(requests, 1);
  checks.push('actual excessive cooldown never retried early');
  await helper.unload();
  mode = 'invalid-response';
  await flow();
  received = message('failure');
  send('packed-schema');
  assert.equal((await received).metadataError.code, 'INVALID_RESPONSE');
  checks.push('actual invalid provider schema rejected');
  await helper.unload();
  mode = 'hold';
  await flow(0, 60_000);
  const held = once(providerEvents, 'held');
  let late = 0;
  helper.getNode('success').on('input', () => {
    late++;
  });
  helper.getNode('failure').on('input', () => {
    late++;
  });
  send('packed-cancel');
  const [heldResponse] = await bounded(held, 'request reaches real HTTP provider');
  const closed = once(heldResponse, 'close');
  await bounded(helper.unload(), 'close installed flow');
  await bounded(closed, 'native fetch abort closes held socket');
  await new Promise((done) => setImmediate(done));
  assert.equal(late, 0);
  checks.push('flow close aborts actual in-flight HTTP without late messages');
  assert.equal(checks.length, 7);
  console.log(
    JSON.stringify({
      actualInstalledRuntime: true,
      hostRuntime: toolsRequire('node-red/package.json').version,
      runtimeBoundary:
        'official Node-RED helper with real node runtime and in-memory fixture storage',
      globalFetchReplaced: false,
      checks,
      passed: checks.length,
      sourceImports: false,
      externalProvider: false,
    }),
  );
} finally {
  await helper.unload();
  if (started) await callback((done) => helper.stopServer(done));
  provider.closeAllConnections();
  if (provider.listening)
    await bounded(new Promise((done) => provider.close(done)), 'owned provider close');
}
