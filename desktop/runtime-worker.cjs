/**
 * @file Fixed utility child for the genuine shipped Node-RED engine and owned provider.
 * @description Closed nonce-bound commands; no project-controlled path, executable, node type or endpoint.
 * @exports No public exports; only its exact parent port communicates with the native owner.
 * @data startup/active/closing retain actual operations; normal exit requires parent acknowledgement of actual runtime/provider closure.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const { createRequire } = require('node:module');
const { join, isAbsolute } = require('node:path');
const fs = require('node:fs');
const { ancestors } = require('./files.cjs');
const { createFlowEngine } = require('./flow-engine.cjs');
const [resourceRoot, directory, nonce] = process.argv.slice(2);
if (
  process.argv.length !== 5 ||
  !isAbsolute(resourceRoot) ||
  !isAbsolute(directory) ||
  !/^[a-f0-9]{64}$/.test(nonce) ||
  !process.parentPort
)
  throw new Error('The exact owned native runtime is required.');
ancestors(directory);
if (!fs.lstatSync(directory).isDirectory() || fs.readdirSync(directory).length)
  throw new Error('A fresh transient runtime directory is required.');
const requireRuntime = createRequire(join(resourceRoot, 'runtime-package.json'));
const api = requireRuntime(join(resourceRoot, 'library/workbench/project.js'));
let engine,
  active,
  closing,
  closeId,
  closed = false,
  failed = false,
  lastId = 0;
function send(value) {
  process.parentPort.postMessage({ schema: 1, nonce, ...value });
}
const startup = (async () => {
  const RED = requireRuntime('node-red');
  if (requireRuntime('node-red/package.json').version !== '5.0.8')
    throw new Error('The pinned actual Node-RED runtime is required.');
  engine = await createFlowEngine({
    RED,
    registerService: requireRuntime(join(resourceRoot, 'library/nodes/metadata-service.js')),
    registerLookup: requireRuntime(join(resourceRoot, 'library/nodes/resilient-metadata.js')),
    projectApi: api,
    userDirectory: directory,
    progress: (value) => send({ type: 'progress', value }),
  });
  send({ type: 'ready', runtimeVersion: RED.version(), nodeVersion: process.versions.node });
})().catch(() => {
  failed = true;
  send({ type: 'fatal', code: 'runtime-startup' });
});

/** A close response is not process exit: the parent sends exit only after receiving this exact closure proof. */
function close(id) {
  if (closeId === undefined) closeId = id;
  if (!closing)
    closing = (async () => {
      await startup;
      const result = engine ? await engine.close() : null;
      if (active) await active;
      if (result && (!result.closed || result.providerListening))
        throw new Error('Actual runtime closure was not proven.');
      closed = true;
      send({ type: 'closed', id: closeId, success: !failed && Boolean(result), value: result });
    })().catch(() => {
      failed = true;
      send({ type: 'fatal', code: 'runtime-close' });
    });
  return closing;
}
process.parentPort.on('message', (event) => {
  const value = event.data;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.schema !== 1 ||
    value.nonce !== nonce ||
    !Number.isSafeInteger(value.id) ||
    value.id !== lastId + 1 ||
    Object.keys(value).sort().join('|') !==
      (value.operation === 'run'
        ? 'id|nonce|operation|project|schema'
        : 'id|nonce|operation|schema')
  ) {
    failed = true;
    send({ type: 'fatal', code: 'runtime-protocol' });
    return;
  }
  lastId = value.id;
  if (value.operation === 'exit') {
    if (closed) process.exit(failed ? 1 : 0);
    else {
      failed = true;
      send({ type: 'fatal', code: 'unproven-exit' });
    }
    return;
  }
  if (value.operation === 'close') {
    void close(value.id);
    return;
  }
  if (!['run', 'cancel'].includes(value.operation) || closing || failed) {
    send({ type: 'response', id: value.id, success: false, code: 'operation-unavailable' });
    return;
  }
  if (value.operation === 'cancel') {
    void startup
      .then(async () => {
        if (!engine || failed) throw new Error('Runtime unavailable.');
        const result = await engine.cancel();
        send({ type: 'response', id: value.id, success: true, value: result });
      })
      .catch(() => send({ type: 'response', id: value.id, success: false, code: 'cancel-failed' }));
    return;
  }
  if (active) {
    send({ type: 'response', id: value.id, success: false, code: 'batch-active' });
    return;
  }
  active = startup
    .then(async () => {
      if (!engine || failed || closing) throw new Error('Runtime unavailable.');
      const project = api.parseProject(JSON.stringify(value.project));
      const result = await engine.run(project);
      send({ type: 'response', id: value.id, success: true, value: result });
    })
    .catch(() => send({ type: 'response', id: value.id, success: false, code: 'batch-failed' }))
    .finally(() => {
      active = undefined;
    });
});
