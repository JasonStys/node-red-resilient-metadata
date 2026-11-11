/**
 * @file Independent event-order regressions for real-child ownership protocol.
 * @description Inert transport controls observable exit ordering without launching an external runtime.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createChannel } = require('../runtime-channel.cjs');
const nonce = 'a'.repeat(64);
function fixture(progress) {
  const child = new EventEmitter();
  child.sent = [];
  child.postMessage = (value) => child.sent.push(value);
  const channel = createChannel(child, nonce, progress);
  const emit = (value) => child.emit('message', { schema: 1, nonce, ...value });
  const ready = () => emit({ type: 'ready', runtimeVersion: '5.0.8', nodeVersion: '24.22.2' });
  const closed = (success = true) =>
    emit({
      type: 'closed',
      id: child.sent.find((item) => item.operation === 'close').id,
      success,
      value: { closed: true, providerListening: false, actualNodeRedVersion: '5.0.8' },
    });
  return { child, channel, emit, ready, closed };
}
test('startup-close race never admits a waiting run and close waits actual exit', async () => {
  const f = fixture();
  const run = f.channel.request('run', {});
  const refused = assert.rejects(run);
  let completed = false;
  const close = f.channel.close().then(() => {
    completed = true;
  });
  f.ready();
  await refused;
  assert.deepEqual(
    f.child.sent.map((v) => v.operation),
    ['close'],
  );
  f.closed();
  await Promise.resolve();
  assert.equal(completed, false);
  f.child.emit('exit', 0);
  await close;
  assert.equal(completed, true);
});
test('actual response, proven listener closure and exit zero are all required', async () => {
  const f = fixture();
  f.ready();
  const run = f.channel.request('run', { title: 'Authored' });
  await Promise.resolve();
  f.emit({ type: 'response', id: 1, success: true, value: { completed: 2 } });
  assert.deepEqual(await run, { completed: 2 });
  const close = f.channel.close();
  f.closed();
  assert.deepEqual(
    f.child.sent.map((v) => v.id),
    [1, 2, 3],
  );
  f.child.emit('exit', 0);
  assert.equal((await close).providerListening, false);
});
test('fatal transport never releases an accepted run before actual exit', async () => {
  const f = fixture();
  f.ready();
  const run = f.channel.request('run', {});
  let settled = false;
  const refused = assert.rejects(
    run.finally(() => {
      settled = true;
    }),
  );
  await Promise.resolve();
  f.emit({ type: 'fatal', code: 'runtime-operation' });
  await Promise.resolve();
  assert.equal(settled, false);
  f.closed(false);
  f.child.emit('exit', 1);
  await refused;
  await assert.rejects(f.channel.close());
  assert.equal(settled, true);
});
for (const mutation of [
  'wrong-nonce',
  'duplicate-ready',
  'unknown-response',
  'unclosed-exit',
  'nonzero-exit',
  'observer-failure',
])
  test('fails closed: ' + mutation, async () => {
    const f = fixture(
      mutation === 'observer-failure'
        ? () => {
            throw new Error('observer');
          }
        : undefined,
    );
    f.ready();
    if (mutation === 'wrong-nonce')
      f.child.emit('message', { schema: 1, nonce: 'b'.repeat(64), type: 'progress', value: {} });
    if (mutation === 'duplicate-ready') f.ready();
    if (mutation === 'unknown-response')
      f.emit({ type: 'response', id: 99, success: true, value: {} });
    if (mutation === 'observer-failure')
      f.emit({ type: 'progress', value: { kind: 'provider-request' } });
    const close = assert.rejects(f.channel.close());
    if (mutation !== 'unclosed-exit') f.closed();
    f.child.emit('exit', mutation === 'nonzero-exit' ? 1 : 0);
    await close;
  });
test('closing coalesces one real close command and cancellation is separately correlated', async () => {
  const f = fixture();
  f.ready();
  const run = f.channel.request('run', {});
  await Promise.resolve();
  const cancel = f.channel.request('cancel');
  await Promise.resolve();
  f.emit({ type: 'response', id: 2, success: true, value: { cancelled: true } });
  await cancel;
  f.emit({ type: 'response', id: 1, success: true, value: { cancelled: true } });
  await run;
  const a = f.channel.close(),
    b = f.channel.close();
  f.closed();
  f.child.emit('exit', 0);
  await Promise.all([a, b]);
  assert.equal(f.child.sent.filter((v) => v.operation === 'close').length, 1);
});
