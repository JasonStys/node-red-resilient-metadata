/**
 * @file Retain real accepted native work and an explicit cancellation side channel until completion.
 * @description Closing stops admission; a cancellation may run concurrently with the one active flow request.
 * @exports createOperations and drainRuntime.
 * @data pending contains real promises, never guessed timer completion or a force-kill success path.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
function createOperations() {
  const pending = new Set();
  let closing = false;
  return {
    get busy() {
      return pending.size > 0;
    },
    get closing() {
      return closing;
    },
    async run(work, parallel = false) {
      if (closing || (!parallel && pending.size) || pending.size >= 4)
        throw new Error('Finish the active operation first.');
      const task = Promise.resolve().then(work);
      pending.add(task);
      try {
        return await task;
      } finally {
        pending.delete(task);
      }
    },
    stopAdmission() {
      closing = true;
    },
    async finish() {
      closing = true;
      await Promise.allSettled([...pending]);
    },
  };
}
/** One failing child cannot race past a still-accepted local export/dialog; every path waits both and the actual exit event. */
async function drainRuntime(runtime, owner) {
  const outcomes = await Promise.allSettled([
    Promise.resolve().then(() => runtime?.close()),
    Promise.resolve().then(() => owner.finish()),
  ]);
  if (runtime) await runtime.exited;
  const failure = outcomes.find((value) => value.status === 'rejected');
  if (failure) throw failure.reason;
}
module.exports = { createOperations, drainRuntime };
