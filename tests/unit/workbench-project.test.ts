/**
 * @file Independent native project and ordinary Node-RED export boundaries.
 * @description Real authored data stays editable while credentials, endpoints and arbitrary executable node graphs are refused.
 * @exports Vitest cases only.
 * @data Synthetic industrial product records and invalid payloads; no network or private profile.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_PROJECT_BYTES,
  SCENARIOS,
  exportFlow,
  parseProject,
  preparedProject,
  projectHash,
  runtimeFlow,
} from '../../src/workbench/project';

describe('native metadata workbench project', () => {
  it('rejects overflowing JSON numbers instead of silently saving them as null', () => {
    const text = JSON.stringify(preparedProject()).replace(
      /"payloads":\[[\s\S]*?\],"provider"/u,
      '"payloads":[1e9999],"provider"',
    );
    expect(text).toContain('1e9999');
    expect(() => parseProject(text)).toThrow(/finite/u);
  });
  it('retains realistic user-authored records, policy and lookup batches through a strict round trip', () => {
    const project = preparedProject();
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    expect(project.payloads).toHaveLength(2);
    expect(project.provider.records.map((value) => value.productId)).toEqual([
      'drive-200',
      'pump-40',
    ]);
    expect(project.provider.records[1]?.metadata).toEqual({
      ratedFlowLMin: 40,
      family: 'fluid-control',
    });
    const edited = structuredClone(project);
    edited.title = 'Approved service commissioning';
    edited.policy.maxConcurrent = 1;
    expect(projectHash(edited)).not.toBe(projectHash(project));
  });
  it('allows deliberately malformed payloads for the actual original node to diagnose without allowing custom flow code', () => {
    const project = preparedProject();
    project.payloads = [null, { productId: '' }, { productId: 'drive-200', unknown: true }];
    expect(parseProject(JSON.stringify(project)).payloads).toEqual(project.payloads);
    for (const extra of [
      { endpoint: 'https://unowned.invalid' },
      { apiToken: 'never a project field' },
      { nodes: [{ type: 'exec', command: 'anything' }] },
    ])
      expect(() => parseProject(JSON.stringify({ ...project, ...extra }))).toThrow();
  });
  it('preserves original policy domains but applies explicit bounded native batch limits', () => {
    const project = preparedProject();
    project.payloads = Array.from({ length: 32 }, () => ({ productId: 'drive-200' }));
    expect(parseProject(JSON.stringify(project)).payloads).toHaveLength(32);
    project.payloads.push({ productId: 'drive-200' });
    expect(() => parseProject(JSON.stringify(project))).toThrow();
    for (const [name, value] of [
      ['timeoutMs', 99],
      ['retryCount', 3],
      ['maxQueueDepth', 65],
      ['maxConcurrent', 9],
      ['maxResponseBytes', 65537],
    ] as const)
      expect(() =>
        parseProject(
          JSON.stringify({
            ...preparedProject(),
            policy: { ...preparedProject().policy, [name]: value },
          }),
        ),
      ).toThrow();
  });
  it('refuses duplicate and escaped-equivalent keys, excessive depth, excessive bytes and malformed Unicode', () => {
    for (const value of [
      '{"schema":1,"schema":1}',
      '{"schema":1,"\\u0073chema":1}',
      '['.repeat(17) + '0' + ']'.repeat(17),
      ' '.repeat(MAX_PROJECT_BYTES + 1),
      '{"x":"\ud800"}',
    ])
      expect(() => parseProject(value)).toThrow();
  });
  it('refuses ambiguous record editions and oversize record data instead of truncating it', () => {
    const project = preparedProject();
    project.provider.records.push(project.provider.records[0]!);
    expect(() => parseProject(JSON.stringify(project))).toThrow();
    const other = preparedProject();
    other.provider.records[0]!.documentation = [
      { title: 'Oversize URL', url: 'https://docs.example.test/' + 'x'.repeat(65536) },
    ];
    expect(() => parseProject(JSON.stringify(other))).toThrow();
  });
  it('admits each named reliability fault as data and builds only fixed actual shipped runtime types', () => {
    for (const scenario of SCENARIOS)
      expect(preparedProject(scenario).provider.scenario).toBe(scenario);
    const flow = runtimeFlow(preparedProject(), 'http://127.0.0.1:40501');
    expect(flow.map((node) => node.type)).toEqual([
      'metadata-service',
      'resilient-metadata',
      'native-capture',
      'native-capture',
    ]);
    expect(flow[1]?.wires).toEqual([['success'], ['failure']]);
    for (const url of [
      'https://outside.invalid',
      'http://localhost:40501',
      'http://127.0.0.1:40501/path',
      'http://user@127.0.0.1:40501',
      'http://127.0.0.1:40501?x=1',
    ])
      expect(() => runtimeFlow(preparedProject(), url)).toThrow();
  });
  it('exports a real editable Node-RED flow with explicit independently configured endpoint and no credentials/native capture type', () => {
    const flow = exportFlow(preparedProject());
    expect(flow.filter((node) => node.type === 'inject')).toHaveLength(2);
    expect(flow.filter((node) => node.type === 'debug')).toHaveLength(2);
    expect(flow.find((node) => node.type === 'metadata-service')?.baseUrl).toBe(
      'https://metadata.example.test',
    );
    expect(flow.map((node) => node.type)).not.toContain('native-capture');
    expect(JSON.stringify(flow)).not.toContain('apiToken');
    expect(JSON.parse(flow.find((node) => node.id === 'input-0')?.payload as string)).toEqual({
      productId: 'drive-200',
      version: '2.4.1',
      locale: 'en-US',
    });
  });
});
