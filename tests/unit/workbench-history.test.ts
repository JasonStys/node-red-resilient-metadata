/**
 * @file Native history bindings and bounded retention regressions.
 * @description Validates actual-project identity, message completion, exact output order and explicit journal expiry.
 * @exports Vitest cases only; synthetic receipt data is not execution evidence.
 * @data Two authorized sample products with literal message outcomes and distinct UUIDs.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import { describe, expect, it } from 'vitest';
import {
  appendRun,
  parseState,
  preparedProject,
  projectHash,
  type WorkbenchRun,
  type WorkbenchState,
} from '../../src/workbench/project';
function fixture(index = 0): { state: WorkbenchState; run: WorkbenchRun } {
  const project = preparedProject();
  const id = '123e4567-e89b-42d3-a456-' + index.toString(16).padStart(12, '0');
  return {
    state: { schema: 1, project, history: [], dropped: 0 },
    run: {
      schema: 1,
      id,
      projectSha256: projectHash(project),
      completedAt: '2026-11-11T12:00:00.000Z',
      deployment: index + 1,
      revision: 'a'.repeat(64),
      actualNodeRedVersion: '5.0.8',
      scenario: 'success',
      cancelled: false,
      results: project.provider.records.map((record, row) => ({
        index: row,
        received: true,
        done: true,
        outcome: 'success',
        message: {
          _msgid: id + '-' + row,
          payload: record,
          metadataLookup: {
            attempts: 1,
            correlationId: id + '-' + row,
            durationMs: 3,
            productId: record.productId,
          },
        },
      })),
      provider: {
        requests: 2,
        deniedRequests: 0,
        listenersClosed: false,
        trace: project.provider.records.map((record, row) => ({
          index: row,
          productId: record.productId,
          version: record.version,
          locale: 'en-US',
          receivedMs: row + 1,
          status: 200,
          closed: true,
        })),
      },
      queue: { active: 0, pending: 0, rejected: 0, highWaterMark: 0, closed: false },
      durationMs: 5,
    },
  };
}
describe('native metadata history', () => {
  it('retains the exact authored project beside each validated run while preserving current configuration', () => {
    const { state, run } = fixture();
    const next = appendRun(state, state.project, run);
    expect(parseState(JSON.stringify(next))).toEqual(next);
    expect(next.history[0]?.run.id).toBe(run.id);
    expect(next.project).toEqual(state.project);
    expect(state.history).toEqual([]);
  });
  it('rejects an altered project, duplicate run identity and wrong output order rather than inventing provenance', () => {
    const { state, run } = fixture();
    const next = appendRun(state, state.project, run);
    const wrong = structuredClone(next);
    wrong.history[0]!.project.provider.records[0]!.displayName = 'Different authorized record';
    expect(() => parseState(JSON.stringify(wrong))).toThrow();
    expect(() => appendRun(next, state.project, run)).toThrow();
    const reordered = structuredClone(run);
    reordered.results.reverse();
    expect(() => appendRun(state, state.project, reordered)).toThrow();
  });
  it('rejects incomplete actual node/output and provider-response evidence', () => {
    const { state, run } = fixture();
    for (const change of [
      (value: WorkbenchRun) => {
        value.results[0]!.done = false;
      },
      (value: WorkbenchRun) => {
        value.results[0]!.message!._msgid = 'unrelated-message';
      },
      (value: WorkbenchRun) => {
        value.provider.trace[0]!.closed = false;
      },
      (value: WorkbenchRun) => {
        value.provider.requests = 3;
      },
    ]) {
      const changed = structuredClone(run);
      change(changed);
      expect(() => appendRun(state, state.project, changed)).toThrow();
    }
  });
  it('keeps pre-input cancellation distinct from actual completed node work', () => {
    const { state, run } = fixture();
    run.cancelled = true;
    run.results = run.results.map((row) => ({
      ...row,
      received: false,
      done: false,
      outcome: 'not-started',
      message: null,
    }));
    run.provider.requests = 0;
    run.provider.trace = [];
    run.queue = null;
    expect(appendRun(state, state.project, run).history[0]?.run.results[0]?.done).toBe(false);
  });
  it('expires only the oldest bounded journal entry and reports the count explicitly', () => {
    let { state } = fixture();
    for (let index = 0; index < 11; index++) {
      const next = fixture(index);
      state = appendRun(state, next.state.project, next.run);
    }
    expect(state.history).toHaveLength(10);
    expect(state.dropped).toBe(1);
    expect(state.history[0]?.run.id).toBe(fixture(1).run.id);
    expect(state.history.at(-1)?.run.id).toBe(fixture(10).run.id);
  });
  it('rejects a scenario mismatch and uncancelled not-started result instead of claiming execution', () => {
    const { state, run } = fixture();
    run.scenario = 'auth';
    expect(() => appendRun(state, state.project, run)).toThrow();
    run.scenario = 'success';
    run.results[0] = {
      index: 0,
      received: false,
      done: false,
      outcome: 'not-started',
      message: null,
    };
    expect(() => appendRun(state, state.project, run)).toThrow();
  });
  it('expires old complete runs by actual serialized-byte budget before the entry-count cap', () => {
    let { state } = fixture();
    const record = {
      ...state.project.provider.records[0]!,
      metadata: Object.fromEntries(
        Array.from({ length: 120 }, (_value, index) => ['authorizedNote' + index, 'a'.repeat(500)]),
      ),
    };
    state.project.provider.records = [record];
    state.project.payloads = Array.from({ length: 32 }, () => ({
      productId: record.productId,
      version: record.version,
    }));
    for (let index = 0; index < 9; index++) {
      const run = fixture(index).run;
      run.projectSha256 = projectHash(state.project);
      run.results = state.project.payloads.map((_payload, row) => ({
        index: row,
        received: true,
        done: true,
        outcome: 'success',
        message: { _msgid: run.id + '-' + row, payload: record },
      }));
      run.provider.requests = 32;
      run.provider.trace = run.results.map((row) => ({
        index: row.index,
        productId: record.productId,
        version: record.version,
        locale: null,
        receivedMs: row.index,
        status: 200,
        closed: true,
      }));
      state = appendRun(state, state.project, run);
    }
    expect(state.history.length).toBeLessThan(10);
    expect(state.dropped).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThanOrEqual(16 * 1024 * 1024);
  });
});
