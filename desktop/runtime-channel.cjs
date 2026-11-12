/**
 * @file Retain nonce-bound utility-process work through actual exit, including startup/close races.
 * @description A closure acknowledgement alone never releases a pending run or transient directory.
 * @exports createChannel.
 * @data Monotonic command IDs need constant memory; pending requests are bounded to four.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const fields = (value, expected) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === expected;
function createChannel(child, nonce, progress = () => {}) {
  let resolveReady, rejectReady, resolveExit;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {});
  const exited = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const pending = new Map();
  let sequence = 0,
    readySeen = false,
    closing = false,
    closeId,
    closure,
    exitSent = false,
    exitResult,
    fault;
  const failure = () =>
    new Error(
      'The owned runtime did not complete normally; saved projects and ownership evidence were preserved.',
    );
  function post(operation, project, id = ++sequence) {
    if (!Number.isSafeInteger(id) || id < 1) throw failure();
    child.postMessage({
      schema: 1,
      nonce,
      id,
      operation,
      ...(operation === 'run' ? { project } : {}),
    });
    return id;
  }
  function close() {
    if (!closing && !exitResult) {
      closing = true;
      try {
        closeId = post('close');
      } catch {
        fault = true;
      }
    }
    return exited.then((result) => {
      if (!result.success) throw failure();
      return result.closure;
    });
  }
  function broken() {
    fault = true;
    void close().catch(() => {});
  }
  child.on('message', (value) => {
    if (!value || value.schema !== 1 || value.nonce !== nonce) {
      broken();
      return;
    }
    try {
      if (
        value.type === 'ready' &&
        fields(value, 'nodeVersion|nonce|runtimeVersion|schema|type') &&
        !readySeen &&
        /^5\.0\.8(?:-git)?$/.test(value.runtimeVersion) &&
        /^24\./.test(value.nodeVersion)
      ) {
        readySeen = true;
        resolveReady({ runtimeVersion: value.runtimeVersion, nodeVersion: value.nodeVersion });
        return;
      }
      if (
        value.type === 'progress' &&
        fields(value, 'nonce|schema|type|value') &&
        value.value &&
        Buffer.byteLength(JSON.stringify(value.value)) <= 16384
      ) {
        progress(value.value);
        return;
      }
      if (
        value.type === 'response' &&
        fields(
          value,
          value.success === true
            ? 'id|nonce|schema|success|type|value'
            : 'code|id|nonce|schema|success|type',
        ) &&
        typeof value.success === 'boolean'
      ) {
        const task = pending.get(value.id);
        if (!task || Buffer.byteLength(JSON.stringify(value)) > 9 * 1024 * 1024) {
          broken();
          return;
        }
        pending.delete(value.id);
        if (value.success) task.resolve(value.value);
        else task.reject(failure());
        return;
      }
      if (
        value.type === 'closed' &&
        fields(value, 'id|nonce|schema|success|type|value') &&
        closing &&
        value.id === closeId &&
        !closure &&
        typeof value.success === 'boolean'
      ) {
        closure = value;
        if (
          !fields(value.value, 'actualNodeRedVersion|closed|providerListening') ||
          value.value.closed !== true ||
          value.value.providerListening !== false ||
          !/^5\.0\.8(?:-git)?$/.test(value.value.actualNodeRedVersion)
        )
          fault = true;
        exitSent = true;
        post('exit');
        return;
      }
      if (
        value.type === 'fatal' &&
        fields(value, 'code|nonce|schema|type') &&
        typeof value.code === 'string'
      ) {
        broken();
        return;
      }
      broken();
    } catch {
      broken();
    }
  });
  child.on('error', broken);
  child.on('exit', (code) => {
    const success =
      code === 0 &&
      !fault &&
      readySeen &&
      closure?.success === true &&
      exitSent &&
      pending.size === 0;
    const error = failure();
    rejectReady(error);
    for (const task of pending.values()) task.reject(error);
    pending.clear();
    exitResult = { code, success, closure: closure?.value ?? null };
    resolveExit(exitResult);
  });
  async function request(operation, project) {
    if (
      !['run', 'cancel'].includes(operation) ||
      closing ||
      exitResult ||
      fault ||
      pending.size >= 4
    )
      throw failure();
    await ready;
    if (closing || exitResult || fault || pending.size >= 4) throw failure();
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        post(operation, project, id);
      } catch {
        broken(); /* The accepted request remains owned until actual child exit. */
      }
    });
  }
  return { ready, exited, request, close };
}
module.exports = { createChannel };
