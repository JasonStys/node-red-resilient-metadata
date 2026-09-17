/**
 * @file Node-RED runtime integration tests.
 * @description Loads both custom nodes in the official helper and exercises message routing and close.
 * @exports Vitest integration cases only.
 * @data network access is replaced by deterministic fetch doubles; the credential value is synthetic.
 */
import type { NodeMessageInFlow } from 'node-red';
import helper from 'node-red-node-test-helper';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import metadataServiceNode from '../../src/nodes/metadata-service';
import resilientMetadataNode from '../../src/nodes/resilient-metadata';
import { jsonResponse, recordFixture } from '../unit/fixtures';

beforeAll(async () => {
  helper.init(require.resolve('node-red'));
  await callbackAsPromise((done) => helper.startServer(done));
});

afterEach(async () => {
  await helper.unload();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await callbackAsPromise((done) => helper.stopServer(done));
});

describe('resilient-metadata in Node-RED', () => {
  it('uses protected credentials and routes a valid response to output one', async () => {
    let authorization: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        authorization = new Headers(init?.headers).get('authorization');
        return jsonResponse(recordFixture());
      }),
    );
    await loadFlow();

    const received = nextMessage('success');
    helper.getNode('lookup').receive({
      _msgid: 'integration-success',
      payload: { productId: 'drive-200', version: '2.4.1' },
    });

    await expect(received).resolves.toMatchObject({
      metadataLookup: { attempts: 1, correlationId: 'integration-success' },
      payload: { displayName: 'Synthetic Drive 200', productId: 'drive-200' },
    });
    expect(authorization).toBe('Bearer integration-token');
  });

  it('routes malformed flow input to the structured error output without network work', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await loadFlow();

    const received = nextMessage('failure');
    helper.getNode('lookup').receive({ _msgid: 'integration-invalid', payload: { productId: '' } });

    await expect(received).resolves.toMatchObject({
      metadataError: {
        code: 'INVALID_INPUT',
        correlationId: 'integration-invalid',
        retriable: false,
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('distinguishes authentication failures on the structured error output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    );
    await loadFlow();

    const received = nextMessage('failure');
    helper.getNode('lookup').receive({
      _msgid: 'integration-auth',
      payload: { productId: 'drive-200' },
    });

    await expect(received).resolves.toMatchObject({
      metadataError: { code: 'AUTHENTICATION_FAILED', retriable: false },
    });
  });

  it('aborts in-flight work when the flow is unloaded', async () => {
    let requestStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_input: string | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            requestStarted?.();
            init?.signal?.addEventListener(
              'abort',
              () => {
                aborted = true;
                reject(new DOMException('aborted', 'AbortError'));
              },
              { once: true },
            );
          }),
      ),
    );
    await loadFlow();
    helper
      .getNode('lookup')
      .receive({ _msgid: 'integration-close', payload: { productId: 'drive-200' } });
    await started;

    await helper.unload();
    expect(aborted).toBe(true);
  });
});

async function loadFlow(): Promise<void> {
  await helper.load([metadataServiceNode, resilientMetadataNode], baseFlow(), {
    service: { apiToken: 'integration-token' },
  });
}

function baseFlow(): Array<Record<string, unknown>> {
  return [
    {
      id: 'service',
      type: 'metadata-service',
      name: 'Local metadata service',
      baseUrl: 'http://127.0.0.1:4099',
      timeoutMs: 1_000,
      maxResponseBytes: 16_384,
      retryCount: 0,
      retryDelayMs: 0,
      maxConcurrent: 2,
      maxQueueDepth: 4,
    },
    {
      id: 'lookup',
      type: 'resilient-metadata',
      name: 'Lookup metadata',
      service: 'service',
      requestProperty: 'payload',
      wires: [['success'], ['failure']],
    },
    { id: 'success', type: 'helper' },
    { id: 'failure', type: 'helper' },
  ];
}

function nextMessage(nodeId: string): Promise<NodeMessageInFlow> {
  return new Promise((resolve) => {
    helper.getNode(nodeId).once('input', (message: NodeMessageInFlow) => resolve(message));
  });
}

function callbackAsPromise(register: (done: (error?: Error) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    register((error) => (error === undefined ? resolve() : reject(error)));
  });
}
