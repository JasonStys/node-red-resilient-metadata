/**
 * @file Resilient metadata client unit tests.
 * @description Covers request construction, credentials, retries, limits, schemas, timeout, and close.
 * @exports Vitest test cases only.
 */
import { describe, expect, it, vi } from 'vitest';
import { MetadataClient, type FetchLike } from '../../src/runtime/metadata-client';
import { configurationFixture, jsonResponse, recordFixture, requestFixture } from './fixtures';

describe('MetadataClient success path', () => {
  it('builds an encoded GET, sends protected headers, and returns validated evidence', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetch: FetchLike = async (input, init) => {
      capturedUrl = input.toString();
      capturedInit = init;
      return jsonResponse(recordFixture());
    };
    const client = new MetadataClient({
      apiToken: 'private-token',
      configuration: configurationFixture(),
      fetch,
    });

    const result = await client.lookup(requestFixture(), 'corr-123');
    expect(result).toMatchObject({ attempts: 1, record: { productId: 'drive-200' } });
    expect(capturedUrl).toBe(
      'https://metadata.example.test/v1/products/drive-200?locale=en-US&version=2.4.1',
    );
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('authorization')).toBe('Bearer private-token');
    expect(headers.get('x-correlation-id')).toBe('corr-123');
    expect(capturedInit?.method).toBe('GET');
    expect(capturedInit?.redirect).toBe('error');
  });

  it('omits optional token and version', async () => {
    const fetch = vi.fn<FetchLike>(async (_input, init) => {
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
      return jsonResponse(recordFixture({ version: 'latest' }));
    });
    const client = new MetadataClient({ configuration: configurationFixture(), fetch });
    await client.lookup(requestFixture({ version: undefined }), 'corr-no-token');
    expect(fetch.mock.calls[0]?.[0].toString()).not.toContain('version=');
  });
});

describe('MetadataClient failure policy', () => {
  it('retries one transient server failure and then succeeds', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(recordFixture()));
    const sleep = vi.fn(async () => undefined);
    const client = new MetadataClient({
      configuration: configurationFixture({ retryCount: 1, retryDelayMs: 25 }),
      fetch,
      sleep,
    });

    await expect(client.lookup(requestFixture(), 'retry')).resolves.toMatchObject({ attempts: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(25, expect.any(AbortSignal));
  });

  it.each([
    [401, 'AUTHENTICATION_FAILED'],
    [403, 'AUTHENTICATION_FAILED'],
    [404, 'NOT_FOUND'],
    [400, 'HTTP_ERROR'],
  ] as const)('does not retry HTTP %s', async (status, code) => {
    const fetch = vi.fn<FetchLike>(async () =>
      Promise.resolve(new Response('', { headers: { 'x-request-id': 'safe-request-id' }, status })),
    );
    const client = new MetadataClient({ configuration: configurationFixture(), fetch });
    await expect(client.lookup(requestFixture(), 'http-error')).rejects.toMatchObject({ code });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries network failures up to the configured bound', async () => {
    const fetch = vi.fn<FetchLike>(async () => Promise.reject(new Error('socket failed')));
    const client = new MetadataClient({
      configuration: configurationFixture({ retryCount: 1 }),
      fetch,
      sleep: async () => undefined,
    });
    await expect(client.lookup(requestFixture(), 'network')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('turns deadline expiry into a retriable timeout error', async () => {
    const fetch: FetchLike = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      });
    const client = new MetadataClient({
      configuration: configurationFixture({ retryCount: 0, timeoutMs: 15 }),
      fetch,
    });
    await expect(client.lookup(requestFixture(), 'timeout')).rejects.toMatchObject({
      code: 'TIMEOUT',
      retriable: true,
    });
  });

  it('cancels the built-in retry delay when the caller aborts', async () => {
    const fetch = vi.fn<FetchLike>(async () => Promise.reject(new Error('offline')));
    const client = new MetadataClient({
      configuration: configurationFixture({ retryCount: 1, retryDelayMs: 5_000 }),
      fetch,
    });
    const controller = new AbortController();
    const result = client.lookup(requestFixture(), 'cancel-retry', controller.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('propagates external cancellation and service close', async () => {
    const fetch: FetchLike = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () =>
            reject(
              init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted'),
            ),
          { once: true },
        );
      });
    const client = new MetadataClient({
      configuration: configurationFixture({ retryCount: 0 }),
      fetch,
    });
    const controller = new AbortController();
    const cancelled = client.lookup(requestFixture(), 'cancelled', controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: 'CANCELLED' });

    const closing = client.lookup(requestFixture(), 'closing');
    client.close();
    await expect(closing).rejects.toMatchObject({ code: 'NODE_CLOSING' });
    await expect(client.lookup(requestFixture(), 'late')).rejects.toMatchObject({
      code: 'NODE_CLOSING',
    });
  });
});

describe('MetadataClient response validation', () => {
  it('rejects declared and streamed bodies beyond the byte limit', async () => {
    const declared = new MetadataClient({
      configuration: configurationFixture({ maxResponseBytes: 1024, retryCount: 0 }),
      fetch: async () =>
        new Response('{}', {
          headers: { 'content-length': '2048', 'content-type': 'application/json' },
        }),
    });
    await expect(declared.lookup(requestFixture(), 'declared')).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1025));
        controller.close();
      },
    });
    const streamed = new MetadataClient({
      configuration: configurationFixture({ maxResponseBytes: 1024, retryCount: 0 }),
      fetch: async () => new Response(stream, { headers: { 'content-type': 'application/json' } }),
    });
    await expect(streamed.lookup(requestFixture(), 'streamed')).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
    });
  });

  it.each([
    [
      'missing JSON media type',
      async () => new Response('{}', { headers: { 'content-type': 'text/plain' } }),
    ],
    [
      'malformed JSON',
      async () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    ],
    ['schema mismatch', async () => jsonResponse({ productId: 'drive-200' })],
    ['identity mismatch', async () => jsonResponse(recordFixture({ productId: 'other-product' }))],
    ['version mismatch', async () => jsonResponse(recordFixture({ version: '9.9.9' }))],
  ] as const)('rejects %s', async (_label, fetch) => {
    const client = new MetadataClient({
      configuration: configurationFixture({ retryCount: 0 }),
      fetch,
    });
    await expect(client.lookup(requestFixture(), 'invalid-response')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retriable: false,
    });
  });

  it('rejects an empty successful body as invalid JSON', async () => {
    const client = new MetadataClient({
      configuration: configurationFixture({ retryCount: 0 }),
      fetch: async () =>
        new Response(null, { headers: { 'content-type': 'application/json' }, status: 200 }),
    });
    await expect(client.lookup(requestFixture(), 'empty')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
