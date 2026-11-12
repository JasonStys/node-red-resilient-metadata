/**
 * @file Real headless Node-RED composition with the original shipped metadata nodes and owned HTTP provider.
 * @description No test-helper runtime, mocked fetch result, imported executable node type or independently chosen endpoint.
 * @exports createFlowEngine; the fixed native child supplies actual installed runtime/registration modules.
 * @data One active batch owns real input-completion hooks, sink outputs, provider responses and cancellation/deploy promises.
 * @remarks Functions, parameters and variables: generated docs/code-map.md. Native project data is plaintext under the trusted OS owner.
 */
'use strict';
const { createServer } = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const { EventEmitter, once } = require('node:events');
const { performance } = require('node:perf_hooks');

/** Supported Node-RED storage extension, transient for this child; durable authored projects/history belong to the native owner. */
function memoryStorage() {
  let flows = [],
    credentials = {},
    settings = {},
    sessions = {};
  return {
    async init() {},
    async getFlows() {
      return structuredClone(flows);
    },
    async saveFlows(value) {
      flows = structuredClone(value);
    },
    async getCredentials() {
      return structuredClone(credentials);
    },
    async saveCredentials(value) {
      credentials = structuredClone(value);
    },
    async getSettings() {
      return structuredClone(settings);
    },
    async saveSettings(value) {
      settings = structuredClone(value);
    },
    async getSessions() {
      return structuredClone(sessions);
    },
    async saveSessions(value) {
      sessions = structuredClone(value);
    },
    async getLibraryEntry() {
      return [];
    },
    async saveLibraryEntry() {
      throw new Error('Native flow library mutation is unavailable.');
    },
  };
}

/** Caller supplies fixed trusted modules and a fresh owned temporary directory, never paths from project JSON. */
async function createFlowEngine({
  RED,
  registerService,
  registerLookup,
  projectApi,
  userDirectory,
  progress = () => {},
}) {
  const events = new EventEmitter();
  const token = randomBytes(32).toString('hex');
  const responses = new Set();
  let observerFailed = false;
  function notify(value) {
    try {
      progress(value);
    } catch {
      observerFailed = true;
    }
  }
  let active,
    closing = false,
    closePromise,
    deployment = 0,
    deniedRequests = 0;
  let deploymentTail = Promise.resolve();
  const provider = createServer((request, response) => {
    const address = provider.address();
    if (
      !address ||
      typeof address === 'string' ||
      request.method !== 'GET' ||
      request.headers.host !== `127.0.0.1:${address.port}` ||
      request.headers.authorization !== 'Bearer ' + token ||
      !active ||
      request.url.length > 2048
    ) {
      deniedRequests++;
      response.writeHead(403);
      response.end();
      return;
    }
    const run = active;
    if (run.trace.length >= 128) {
      response.writeHead(429);
      response.end();
      return;
    }
    let url, productId;
    try {
      url = new URL(request.url, `http://127.0.0.1:${address.port}`);
      if (!url.pathname.startsWith('/v1/products/')) throw new Error('Fixed route required.');
      productId = decodeURIComponent(url.pathname.slice('/v1/products/'.length));
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    const record = run.project.provider.records.filter(
      (item) =>
        item.productId === productId &&
        (!url.searchParams.has('version') || item.version === url.searchParams.get('version')),
    );
    const trace = {
      index: run.trace.length,
      productId,
      version: url.searchParams.get('version'),
      locale: url.searchParams.get('locale'),
      receivedMs: Number((performance.now() - run.started).toFixed(3)),
      status: null,
      closed: false,
    };
    run.trace.push(trace);
    responses.add(response);
    let timer;
    response.once('close', () => {
      clearTimeout(timer);
      trace.closed = true;
      responses.delete(response);
      events.emit('provider-change');
    });
    const reply = (status, body = '', headers = {}) => {
      if (response.destroyed) return;
      trace.status = status;
      response.writeHead(status, { 'content-type': 'application/json', ...headers });
      response.end(body);
    };
    const scenario = run.project.provider.scenario;
    notify({ kind: 'provider-request', requests: run.trace.length, queue: queueSnapshot() });
    if (scenario === 'held') return;
    if (scenario === 'timeout') {
      timer = setTimeout(
        () => reply(200, JSON.stringify(record[0] ?? {})),
        run.project.policy.timeoutMs + 250,
      );
      return;
    }
    const answer = () => {
      if (scenario === 'auth') reply(401);
      else if (scenario === 'not-found' || record.length === 0) reply(404);
      else if (record.length !== 1)
        reply(400, JSON.stringify({ error: 'Specify the unambiguous authored edition.' }));
      else if (scenario === 'malformed') reply(200, '{"schemaVersion":"wrong"}');
      else if (scenario === 'cooldown-excess') reply(503, '', { 'retry-after': '120' });
      else if (trace.index === 0 && scenario === 'rate-limit-once')
        reply(429, '', { 'retry-after': '0' });
      else if (trace.index === 0 && scenario === 'unavailable-once')
        reply(503, '', { 'retry-after': '0' });
      else reply(200, JSON.stringify(record[0]));
    };
    if (run.project.provider.responseDelayMs)
      timer = setTimeout(answer, run.project.provider.responseDelayMs);
    else answer();
  });
  provider.requestTimeout = 5000;
  provider.headersTimeout = 5000;
  provider.keepAliveTimeout = 1000;
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  const address = provider.address();
  if (!address || typeof address === 'string')
    throw new Error('Owned provider did not bind numeric loopback.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  function queueSnapshot() {
    return RED.nodes.getNode('service')?.client?.queueSnapshot() ?? null;
  }
  function settle(row) {
    if (!row.received && active?.cancelled) {
      row.resolve();
      return;
    }
    if (!row.done || (!row.output && !active?.cancelled)) return;
    row.resolve();
  }
  function capture(channel, message) {
    const row = active?.rows.get(message._msgid);
    if (!row || row.output) {
      if (active) active.invalidOutput = true;
      return;
    }
    row.output = { channel, message: structuredClone(message) };
    settle(row);
    notify({
      kind: 'node-output',
      completed: [...active.rows.values()].filter((value) => value.output).length,
      queue: queueSnapshot(),
    });
  }
  let initialized = false;
  try {
    RED.init({
      userDir: userDirectory,
      coreNodesDir: false,
      nodesDir: [],
      httpAdminRoot: false,
      httpNodeRoot: false,
      disableEditor: true,
      credentialSecret: randomBytes(32).toString('hex'),
      storageModule: memoryStorage(),
      externalModules: {
        autoInstall: false,
        palette: { allowInstall: false, allowUpload: false },
        modules: { allowInstall: false },
      },
      telemetry: { enabled: false, updateNotification: false },
      telemetryEnabled: false,
      logging: { console: { level: 'off', metrics: false, audit: false } },
    });
    initialized = true;
    const nodeApi = (label) => ({
      nodes: {
        createNode: RED.nodes.createNode,
        getNode: RED.nodes.getNode,
        registerType: (type, constructor, options) =>
          RED.nodes.registerType(label, type, constructor, options),
      },
      util: RED.util,
    });
    registerService(nodeApi('node-red-contrib-resilient-metadata/metadata-service'));
    registerLookup(nodeApi('node-red-contrib-resilient-metadata/resilient-metadata'));
    RED.nodes.registerType(
      'native-workbench/capture',
      'native-capture',
      function CaptureNode(definition) {
        RED.nodes.createNode(this, definition);
        this.on('input', (message, _send, done) => {
          capture(definition.channel, message);
          done();
        });
      },
    );
    RED.hooks.add('onComplete.native-metadata', (event) => {
      if (event.node.id !== 'lookup') return;
      const row = active?.rows.get(event.msg._msgid);
      if (!row || row.done) {
        if (active) active.invalidOutput = true;
        return;
      }
      row.done = true;
      if (event.error) row.failure = true;
      settle(row);
    });
    const initialFlows = once(RED.events, 'flows:started');
    await RED.start();
    await initialFlows;
  } catch (error) {
    try {
      if (initialized) await RED.stop();
    } finally {
      await new Promise((resolve, reject) =>
        provider.close((failure) => (failure ? reject(failure) : resolve())),
      );
    }
    throw error;
  }

  // Node-RED returns a revision before start completes. Serialize our calls through its actual matching deploy event.
  function setFlowsAndWait(configuration) {
    const operation = deploymentTail.then(async () => {
      let revision,
        observed = [],
        release;
      const completed = new Promise((resolve) => {
        release = resolve;
      });
      const listener = (event) => {
        if (event.id !== 'runtime-deploy') return;
        if (event.payload.revision === revision) release();
        else observed.push(event.payload.revision);
      };
      RED.events.on('runtime-event', listener);
      try {
        const result = await RED.runtime.flows.setFlows({
          flows: configuration,
          deploymentType: 'full',
        });
        revision = result.rev;
        if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision))
          throw new Error('Actual runtime revision was invalid.');
        if (observed.includes(revision)) release();
        await completed;
        return revision;
      } finally {
        RED.events.removeListener('runtime-event', listener);
      }
    });
    deploymentTail = operation.catch(() => {});
    return operation;
  }
  async function deploy(project) {
    const nodes = projectApi
      .runtimeFlow(project, baseUrl)
      .map((node) => (node.type === 'metadata-service' ? node : { ...node, z: 'native-tab' }));
    const revision = await setFlowsAndWait({
      flows: [{ id: 'native-tab', type: 'tab', label: project.title }, ...nodes],
      credentials: { service: { apiToken: token } },
    });
    if (
      !active?.cancelled &&
      (!RED.nodes.getNode('lookup') || !RED.nodes.getNode('service')?.client)
    )
      throw new Error('Actual shipped Node-RED nodes did not deploy.');
    deployment++;
    return revision;
  }
  async function drainResponses() {
    while (responses.size) await once(events, 'provider-change');
  }
  async function cancel() {
    const run = active;
    if (!run) return { cancelled: false };
    if (!run.cancellation)
      run.cancellation = (async () => {
        run.cancelled = true;
        await setFlowsAndWait({ flows: [], credentials: {} });
        for (const row of run.rows.values()) settle(row);
        await Promise.all([...run.rows.values()].map((row) => row.completion));
        await drainResponses();
        return { cancelled: true };
      })();
    return run.cancellation;
  }
  async function run(project) {
    if (closing || active) throw new Error('Finish the current real flow operation first.');
    const input = projectApi.parseProject(JSON.stringify(project));
    const id = randomUUID();
    const current = {
      id,
      project: input,
      projectSha256: projectApi.projectHash(input),
      started: performance.now(),
      rows: new Map(),
      trace: [],
      cancelled: false,
      cancellation: null,
      invalidOutput: false,
    };
    active = current;
    try {
      for (let index = 0; index < input.payloads.length; index++) {
        let resolve;
        const completion = new Promise((done) => {
          resolve = done;
        });
        const messageId = id + '-' + index;
        current.rows.set(messageId, {
          index,
          received: false,
          done: false,
          output: null,
          failure: false,
          resolve,
          completion,
        });
      }
      const revision = await deploy(input);
      if (!current.cancelled)
        for (const [messageId, row] of current.rows) {
          row.received = true;
          RED.nodes
            .getNode('lookup')
            .receive({ _msgid: messageId, payload: structuredClone(input.payloads[row.index]) });
        }
      await Promise.all([...current.rows.values()].map((row) => row.completion));
      if (current.cancellation) await current.cancellation;
      await drainResponses();
      if (
        observerFailed ||
        current.invalidOutput ||
        [...current.rows.values()].some((row) => row.failure)
      )
        throw new Error('Real node completion/output evidence was inconsistent.');
      const result = {
        schema: 1,
        id,
        projectSha256: current.projectSha256,
        completedAt: new Date().toISOString(),
        deployment,
        revision,
        actualNodeRedVersion: RED.version(),
        scenario: input.provider.scenario,
        cancelled: current.cancelled,
        results: [...current.rows.values()].map((row) => ({
          index: row.index,
          received: row.received,
          done: row.done,
          outcome: row.output?.channel ?? (row.received ? 'cancelled' : 'not-started'),
          message: row.output?.message ?? null,
        })),
        provider: {
          requests: current.trace.length,
          deniedRequests,
          listenersClosed: false,
          trace: current.trace,
        },
        queue: queueSnapshot(),
        durationMs: Number((performance.now() - current.started).toFixed(3)),
      };
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 8 * 1024 * 1024)
        throw new Error(
          'Actual evidence exceeds eight MiB; reduce the authored batch. Nothing was truncated.',
        );
      return result;
    } finally {
      // Do not drop owned completion on a deployment/processing error.
      if (current.rows.size && [...current.rows.values()].some((row) => !row.done)) await cancel();
      active = undefined;
    }
  }
  function close() {
    if (!closePromise)
      closePromise = (async () => {
        closing = true;
        await cancel();
        await RED.stop();
        await drainResponses();
        await new Promise((resolve, reject) =>
          provider.close((error) => (error ? reject(error) : resolve())),
        );
        RED.hooks.remove('onComplete.native-metadata');
        return {
          closed: true,
          providerListening: provider.listening,
          actualNodeRedVersion: RED.version(),
        };
      })();
    return closePromise;
  }
  return {
    run,
    cancel,
    close,
    get busy() {
      return Boolean(active);
    },
    get providerUrl() {
      return baseUrl;
    },
  };
}
module.exports = { createFlowEngine };
