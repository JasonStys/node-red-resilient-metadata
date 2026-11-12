/**
 * @file Closed editable native metadata-flow project.
 * @description Reuses original response and service-policy validation while excluding endpoints, credentials and executable flow types.
 * @exports parseProject, parseState, appendRun, projectHash, preparedProject, runtimeFlow, exportFlow and WorkbenchProject/State/Run.
 * @data Message payloads may deliberately fail the original node contract; all project JSON is byte/depth/count bounded.
 * @remarks Functions, parameters and variables are indexed by generated docs/code-map.md.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { metadataRecordSchema } from '../contracts';
import { parseServiceConfiguration } from '../runtime/configuration';

export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
export const SCENARIOS = [
  'success',
  'rate-limit-once',
  'unavailable-once',
  'cooldown-excess',
  'timeout',
  'malformed',
  'auth',
  'not-found',
  'held',
] as const;
const policy = z
  .object({
    timeoutMs: z.number().int().min(100).max(10000),
    maxResponseBytes: z.number().int().min(1024).max(65536),
    retryCount: z.number().int().min(0).max(2),
    retryDelayMs: z.number().int().min(0).max(5000),
    maxConcurrent: z.number().int().min(1).max(8),
    maxQueueDepth: z.number().int().min(0).max(64),
  })
  .strict();
const record = metadataRecordSchema.refine(
  (value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 65536,
  'Keep each authorized record within 64 KiB.',
);
const schema = z
  .object({
    schema: z.literal(1),
    title: z.string().trim().min(1).max(100),
    policy,
    payloads: z.array(z.unknown()).min(1).max(32),
    provider: z
      .object({
        scenario: z.enum(SCENARIOS),
        responseDelayMs: z.number().int().min(0).max(3000),
        records: z.array(record).min(1).max(16),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = value.provider.records.map((item) => item.productId + '/' + item.version);
    if (new Set(keys).size !== keys.length)
      context.addIssue({
        code: 'custom',
        message: 'Product and edition records must be unambiguous.',
      });
    // Validate the exact original policy. Its endpoint is created by the owner and is never project data.
    parseServiceConfiguration({ ...value.policy, baseUrl: 'http://127.0.0.1:1' });
  });
export type WorkbenchProject = z.infer<typeof schema>;

/** Reject duplicate keys and excessive structure before a project can replace persistent state or start a runtime. */
function parseBoundedJson(
  text: string,
  maximum = MAX_PROJECT_BYTES,
  maximumDepth = 16,
  maximumStructures = 10000,
): unknown {
  if (
    typeof text !== 'string' ||
    Buffer.byteLength(text, 'utf8') > maximum ||
    new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(text, 'utf8')) !== text
  )
    throw new Error('Project must be valid Unicode within two MiB.');
  const stack: ({ keys: Set<string>; key: boolean } | null)[] = [];
  let structures = 0;
  for (const [token] of text.matchAll(/"(?:\\.|[^"\\])*"|[{}[\],:]/gu)) {
    if (token === '{' || token === '[') {
      stack.push(token === '{' ? { keys: new Set(), key: true } : null);
      if (stack.length > maximumDepth || ++structures > maximumStructures)
        throw new Error('Project exceeds its JSON structure budget.');
    } else if (token === '}' || token === ']') stack.pop();
    else if (token === ',') {
      const current = stack.at(-1);
      if (current) current.key = true;
    } else if (token.startsWith('"')) {
      const current = stack.at(-1);
      if (current?.key) {
        const name: unknown = JSON.parse(token);
        if (typeof name !== 'string' || current.keys.has(name))
          throw new Error('Project contains duplicate JSON keys.');
        current.keys.add(name);
        current.key = false;
      }
    }
  }
  return JSON.parse(text, (_key: string, value: unknown): unknown => {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error(
        'Project JSON numbers must be finite; use explicit text for out-of-range values.',
      );
    return value;
  }) as unknown;
}

/** Admit a complete editable project before any persistent save or actual flow deployment. */
export function parseProject(text: string): WorkbenchProject {
  return schema.parse(parseBoundedJson(text));
}

const resultRow = z
  .object({
    index: z.number().int().min(0).max(31),
    received: z.boolean(),
    done: z.boolean(),
    outcome: z.enum(['success', 'failure', 'cancelled', 'not-started']),
    message: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();
const runSchema = z
  .object({
    schema: z.literal(1),
    id: z.uuid(),
    projectSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    completedAt: z.iso.datetime(),
    deployment: z.number().int().min(1),
    revision: z.string().regex(/^[a-f0-9]{64}$/u),
    actualNodeRedVersion: z.string().regex(/^5\.0\.8(?:-git)?$/u),
    scenario: z.enum(SCENARIOS),
    cancelled: z.boolean(),
    results: z.array(resultRow).min(1).max(32),
    provider: z
      .object({
        requests: z.number().int().min(0).max(128),
        deniedRequests: z.number().int().nonnegative(),
        listenersClosed: z.literal(false),
        trace: z
          .array(
            z
              .object({
                index: z.number().int().min(0).max(127),
                productId: z.string().max(64),
                version: z.string().max(64).nullable(),
                locale: z.string().max(35).nullable(),
                receivedMs: z.number().finite().nonnegative(),
                status: z.number().int().min(100).max(599).nullable(),
                closed: z.boolean(),
              })
              .strict(),
          )
          .max(128),
      })
      .strict(),
    queue: z
      .object({
        active: z.number().int().min(0).max(8),
        closed: z.boolean(),
        highWaterMark: z.number().int().min(0).max(64),
        pending: z.number().int().min(0).max(64),
        rejected: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    durationMs: z.number().finite().nonnegative(),
  })
  .strict();
export type WorkbenchRun = z.infer<typeof runSchema>;
const historyEntry = z
  .object({ project: schema, run: runSchema })
  .strict()
  .superRefine((entry, context) => {
    if (
      projectHash(entry.project) !== entry.run.projectSha256 ||
      entry.project.payloads.length !== entry.run.results.length ||
      entry.project.provider.scenario !== entry.run.scenario
    )
      context.addIssue({
        code: 'custom',
        message: 'Stored run does not match its exact authored project.',
      });
    for (let index = 0; index < entry.run.results.length; index++) {
      const row = entry.run.results[index]!;
      if (
        row.index !== index ||
        (!entry.run.cancelled && (row.outcome === 'cancelled' || row.outcome === 'not-started')) ||
        (row.outcome === 'not-started'
          ? row.received || row.done || row.message !== null
          : !row.received || !row.done) ||
        (row.outcome === 'success' || row.outcome === 'failure'
          ? row.message?._msgid !== entry.run.id + '-' + index
          : row.message !== null)
      )
        context.addIssue({
          code: 'custom',
          message: 'Stored node completion/output binding is inconsistent.',
        });
    }
    if (
      entry.run.provider.requests !== entry.run.provider.trace.length ||
      entry.run.provider.trace.some((row, index) => row.index !== index || !row.closed)
    )
      context.addIssue({
        code: 'custom',
        message: 'Provider response completion evidence is inconsistent.',
      });
  });
const stateSchema = z
  .object({
    schema: z.literal(1),
    project: schema,
    history: z.array(historyEntry).max(10),
    dropped: z.number().int().nonnegative(),
  })
  .strict();
export type WorkbenchState = z.infer<typeof stateSchema>;
export const MAX_STATE_BYTES = 16 * 1024 * 1024;

/** History is an explicit bounded local journal, not authenticated provenance or an unlimited archive. */
export function parseState(text: string): WorkbenchState {
  const value = stateSchema.parse(parseBoundedJson(text, MAX_STATE_BYTES, 24, 200000));
  if (new Set(value.history.map((entry) => entry.run.id)).size !== value.history.length)
    throw new Error('Run identities must be unambiguous.');
  return value;
}

/** Preserve the exact project alongside each real run, and report every intentionally expired history entry. */
export function appendRun(
  state: WorkbenchState,
  project: WorkbenchProject,
  run: unknown,
): WorkbenchState {
  const current = parseState(JSON.stringify(state));
  const entry = historyEntry.parse({ project, run });
  const history = [...current.history, entry];
  let dropped = current.dropped;
  while (
    history.length > 10 ||
    Buffer.byteLength(JSON.stringify({ ...current, history, dropped }), 'utf8') > MAX_STATE_BYTES
  ) {
    if (history.length <= 1)
      throw new Error(
        'The complete latest run exceeds the local journal budget; export smaller batches. No result was truncated.',
      );
    history.shift();
    dropped++;
  }
  return parseState(JSON.stringify({ ...current, history, dropped }));
}

/** Stable revision identity covers authored messages, actual policy, provider records and fault selection, not a reviewer signature. */
export function projectHash(project: WorkbenchProject): string {
  return createHash('sha256')
    .update(JSON.stringify(parseProject(JSON.stringify(project))))
    .digest('hex');
}

/** Prepared data remains editable in the complete workbench; no separate mock application or external account is required. */
export function preparedProject(
  scenario: (typeof SCENARIOS)[number] = 'success',
): WorkbenchProject {
  return parseProject(
    JSON.stringify({
      schema: 1,
      title: 'Maintenance metadata integration',
      policy: {
        timeoutMs: 1000,
        maxResponseBytes: 16384,
        retryCount: 1,
        retryDelayMs: 0,
        maxConcurrent: 2,
        maxQueueDepth: 4,
      },
      payloads: [
        { productId: 'drive-200', version: '2.4.1', locale: 'en-US' },
        { productId: 'pump-40', version: '3.2.0' },
      ],
      provider: {
        scenario,
        responseDelayMs: 0,
        records: [
          {
            schemaVersion: '1.0',
            productId: 'drive-200',
            version: '2.4.1',
            displayName: 'Training Drive 200',
            lifecycle: 'active',
            sourceTimestamp: '2026-11-01T12:00:00.000Z',
            metadata: { ratedVoltageV: 230, inspectionRequired: true, family: 'motion' },
            documentation: [
              {
                title: 'Authorized maintenance guide',
                url: 'https://docs.example.test/drive-200/2.4.1',
              },
            ],
          },
          {
            schemaVersion: '1.0',
            productId: 'pump-40',
            version: '3.2.0',
            displayName: 'Training Pump 40',
            lifecycle: 'deprecated',
            sourceTimestamp: '2026-11-02T09:00:00.000Z',
            metadata: { ratedFlowLMin: 40, family: 'fluid-control' },
            documentation: [
              {
                title: 'Authorized inspection procedure',
                url: 'https://docs.example.test/pump-40/3.2.0',
              },
            ],
          },
        ],
      },
    }),
  );
}

/** Native runtime flow types are source constants; no imported arbitrary-code node or remote endpoint enters the runtime. */
export function runtimeFlow(project: WorkbenchProject, baseUrl: string): Record<string, unknown>[] {
  const parsed = parseProject(JSON.stringify(project));
  const url = new URL(baseUrl);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('The exact owned provider endpoint is required.');
  return [
    {
      id: 'service',
      type: 'metadata-service',
      name: 'Owned local provider',
      baseUrl: url.origin,
      ...parsed.policy,
    },
    {
      id: 'lookup',
      type: 'resilient-metadata',
      name: parsed.title,
      service: 'service',
      requestProperty: 'payload',
      wires: [['success'], ['failure']],
    },
    { id: 'success', type: 'native-capture', channel: 'success', x: 650, y: 150, wires: [] },
    { id: 'failure', type: 'native-capture', channel: 'failure', x: 650, y: 220, wires: [] },
  ];
}

/** Produce an editable ordinary Node-RED flow for independent deployment; no credential or live native endpoint is exported. */
export function exportFlow(project: WorkbenchProject): Record<string, unknown>[] {
  const parsed = parseProject(JSON.stringify(project));
  return [
    { id: 'metadata-tab', type: 'tab', label: parsed.title, disabled: false },
    {
      id: 'service',
      type: 'metadata-service',
      name: 'Configure your approved service and credentials',
      baseUrl: 'https://metadata.example.test',
      ...parsed.policy,
    },
    {
      id: 'lookup',
      type: 'resilient-metadata',
      z: 'metadata-tab',
      name: parsed.title,
      service: 'service',
      requestProperty: 'payload',
      x: 400,
      y: 180,
      wires: [['success'], ['failure']],
    },
    {
      id: 'success',
      type: 'debug',
      z: 'metadata-tab',
      name: 'Validated metadata',
      active: true,
      complete: 'true',
      x: 690,
      y: 150,
      wires: [],
    },
    {
      id: 'failure',
      type: 'debug',
      z: 'metadata-tab',
      name: 'Structured lookup error',
      active: true,
      complete: 'true',
      x: 690,
      y: 220,
      wires: [],
    },
    ...parsed.payloads.map((payload, index) => ({
      id: 'input-' + index,
      type: 'inject',
      z: 'metadata-tab',
      name: 'Authored payload ' + (index + 1),
      props: [{ p: 'payload' }],
      payload: JSON.stringify(payload),
      payloadType: 'json',
      repeat: '',
      once: false,
      x: 150,
      y: 120 + index * 55,
      wires: [['lookup']],
    })),
  ];
}
