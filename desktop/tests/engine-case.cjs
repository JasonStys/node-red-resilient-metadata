/**
 * @file Actual fixed-runtime consumer for one independently asserted reliability scenario.
 * @description Loads production registrations in genuine headless Node-RED and uses real owned HTTP, never helper/fetch doubles.
 * @exports No public exports; invoked by the bounded native engine contract suite.
 * @data Fresh synthetic userDir and literal case selection only; all original engine/node/provider work must drain.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const RED = require('../../native-runtime/node_modules/node-red');
const api = require('../../dist/workbench/project.js');
const { createFlowEngine } = require('../flow-engine.cjs');
const name = process.argv[2];
const cases = [
  ...api.SCENARIOS.filter((value) => value !== 'held'),
  'invalid-input',
  'queue-full',
  'cancel-held',
  'cancel-before-input',
  'close-held',
  'redeploy',
  'observer-fault',
];
if (!cases.includes(name) || process.argv.length !== 3)
  throw new Error('Select one fixed actual engine case.');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'metadata-actual-engine-'));
  let engine, startRequest;
  const requestStarted = new Promise((resolve) => {
    startRequest = resolve;
  });
  try {
    engine = await createFlowEngine({
      RED,
      registerService: require('../../dist/nodes/metadata-service.js'),
      registerLookup: require('../../dist/nodes/resilient-metadata.js'),
      projectApi: api,
      userDirectory: directory,
      progress: (event) => {
        if (name === 'observer-fault') throw new Error('Synthetic progress transport failure.');
        if (event.kind === 'provider-request') startRequest();
      },
    });
    const project = api.preparedProject();
    if (name === 'observer-fault') {
      let completions = 0;
      RED.hooks.add('onComplete.observer-case', (event) => {
        if (event.node.id === 'lookup') completions++;
      });
      await assert.rejects(engine.run(project), /inconsistent/);
      assert.equal(completions, 2);
      const closed = await engine.close();
      assert.equal(closed.providerListening, false);
      console.log(
        JSON.stringify({
          passed: true,
          case: name,
          actualNodeRedVersion: closed.actualNodeRedVersion,
          providerListening: false,
          noFetchDouble: true,
          originalCompletions: completions,
        }),
      );
      return;
    }
    if (api.SCENARIOS.includes(name)) project.provider.scenario = name;
    if (name === 'timeout') {
      project.policy.timeoutMs = 100;
      project.policy.retryCount = 0;
    }
    if (name === 'invalid-input') project.payloads = [{ productId: '' }, null];
    if (name === 'queue-full') {
      project.payloads = Array.from({ length: 5 }, () => ({ productId: 'drive-200' }));
      project.policy.maxConcurrent = 1;
      project.policy.maxQueueDepth = 0;
      project.provider.responseDelayMs = 100;
    }
    let result, closed;
    if (['cancel-held', 'close-held', 'cancel-before-input'].includes(name)) {
      project.provider.scenario = 'held';
      project.policy.timeoutMs = 10000;
      const pending = engine.run(project);
      if (name !== 'cancel-before-input') await requestStarted;
      if (name === 'close-held') closed = await engine.close();
      else await Promise.all([engine.cancel(), engine.cancel()]);
      result = await pending;
      assert.equal(result.cancelled, true);
      assert.ok(
        result.results.every((row) =>
          name === 'cancel-before-input'
            ? row.received === false && row.done === false && row.outcome === 'not-started'
            : row.received && row.done && row.outcome === 'cancelled',
        ),
      );
      if (name === 'cancel-before-input') assert.equal(result.provider.requests, 0);
      else {
        assert.ok(result.provider.requests > 0);
        assert.ok(result.provider.trace.every((entry) => entry.closed));
      }
    } else {
      result = await engine.run(project);
      assert.equal(result.results.length, project.payloads.length);
      assert.ok(result.results.every((row) => row.done && row.received));
      const errorCodes = result.results.map((row) => row.message?.metadataError?.code);
      if (['success', 'rate-limit-once', 'unavailable-once', 'redeploy'].includes(name)) {
        assert.deepEqual(
          result.results.map((row) => row.outcome),
          ['success', 'success'],
        );
        assert.deepEqual(
          result.results.map((row) => row.message.payload.productId),
          ['drive-200', 'pump-40'],
        );
        assert.equal(result.results[0].message.payload.metadata.ratedVoltageV, 230);
        assert.equal(result.results[1].message.payload.metadata.ratedFlowLMin, 40);
        assert.equal(
          result.provider.requests,
          ['rate-limit-once', 'unavailable-once'].includes(name) ? 3 : 2,
        );
        if (name !== 'success' && name !== 'redeploy')
          assert.deepEqual(
            result.results.map((row) => row.message.metadataLookup.attempts).sort(),
            [1, 2],
          );
      } else if (name === 'queue-full') {
        assert.equal(result.results.filter((row) => row.outcome === 'success').length, 1);
        assert.equal(errorCodes.filter((code) => code === 'QUEUE_FULL').length, 4);
        assert.equal(result.provider.requests, 1);
      } else {
        const expected = {
          auth: 'AUTHENTICATION_FAILED',
          'not-found': 'NOT_FOUND',
          malformed: 'INVALID_RESPONSE',
          timeout: 'TIMEOUT',
          'invalid-input': 'INVALID_INPUT',
          'cooldown-excess': 'HTTP_ERROR',
        }[name];
        assert.equal(typeof expected, 'string');
        assert.deepEqual(errorCodes, [expected, expected]);
        if (name === 'invalid-input') assert.equal(result.provider.requests, 0);
        if (name === 'cooldown-excess') assert.equal(result.provider.requests, 2);
      }
      if (name === 'redeploy') {
        const next = api.preparedProject();
        next.provider.records[0].displayName = 'Authored replacement record';
        const revised = await engine.run(next);
        assert.equal(revised.results[0].message.payload.displayName, 'Authored replacement record');
        assert.equal(revised.deployment, result.deployment + 1);
        // Provider records are outside the flow graph; bind their project identity without inventing a graph change.
        assert.equal(revised.revision, result.revision);
        assert.notEqual(revised.projectSha256, result.projectSha256);
        next.title = 'Authored revised flow graph';
        const graphChanged = await engine.run(next);
        assert.notEqual(graphChanged.revision, revised.revision);
        assert.equal(
          graphChanged.results[0].message.payload.displayName,
          'Authored replacement record',
        );
      }
    }
    closed ??= await engine.close();
    assert.equal(closed.closed, true);
    assert.equal(closed.providerListening, false);
    assert.match(closed.actualNodeRedVersion, /^5\.0\.8(?:-git)?$/);
    assert.deepEqual(await engine.close(), closed);
    console.log(
      JSON.stringify({
        passed: true,
        case: name,
        actualNodeRedVersion: result.actualNodeRedVersion,
        cases: result.results.length,
        providerRequests: result.provider.requests,
        providerListening: closed.providerListening,
        completionProven: true,
        noFetchDouble: true,
      }),
    );
  } finally {
    if (engine) await engine.close();
    await fs.rm(directory, { recursive: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
