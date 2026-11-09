/**
 * @file Server cooldown and cancellation regression tests.
 * @description Exercises 429/503 delta/date waits, resource caps, fallback, retry budgets and close.
 * @exports Vitest cases; synthetic HTTP responses never contact a provider.
 * @data clock is fixed; sleeps are observed or canceled, so no test waits for a real cooldown.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetadataClient, type FetchLike } from '../../src/runtime/metadata-client';
import { configurationFixture, jsonResponse, recordFixture, requestFixture } from './fixtures';

const NOW_MS = Date.parse('Mon, 09 Nov 2026 12:00:00 GMT');

afterEach(() => vi.useRealTimers());

describe('server-directed retry spacing', () => {
  it.each([429, 503])('uses Retry-After delta-seconds for HTTP %s', async (status) => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response('not retained', { status, headers: { 'retry-after': '2' } }),
      )
      .mockResolvedValueOnce(jsonResponse(recordFixture()));
    const sleep = vi.fn(async () => undefined);
    const client = new MetadataClient({ configuration: configurationFixture(), fetch, sleep });

    await expect(client.lookup(requestFixture(), 'cooldown')).resolves.toMatchObject({
      attempts: 2,
    });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(2_000, expect.any(AbortSignal));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['Mon, 09 Nov 2026 12:00:04 GMT', 4_000],
    ['Mon, 09 Nov 2026 11:59:59 GMT', 25],
    ['0', 25],
    [' 1 ', 1_000],
    ['30', 30_000],
    ['not a date', 25],
    ['-2', 25],
    ['0.5', 25],
    ['1, 2', 25],
    ['Tue, 09 Nov 2026 12:00:04 GMT', 25],
    ['Mon, 30 Feb 2026 12:00:00 GMT', 25],
    ['x'.repeat(129), 25],
  ])('handles %s with bounded spacing %i ms', async (header, delay) => {
    const sleep = vi.fn(async () => undefined);
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response('', { status: 503, headers: { 'retry-after': header } }))
      .mockResolvedValueOnce(jsonResponse(recordFixture()));
    const client = new MetadataClient({
      configuration: configurationFixture({ retryDelayMs: 25 }),
      fetch,
      sleep,
      now: () => NOW_MS,
    });
    await client.lookup(requestFixture(), 'date');
    expect(sleep).toHaveBeenCalledExactlyOnceWith(delay, expect.any(AbortSignal));
  });

  it.each(['31', '9'.repeat(128), 'Mon, 09 Nov 2026 12:00:31 GMT'])(
    'stops rather than retrying before the server cooldown %s',
    async (header) => {
      const fetch = vi.fn<FetchLike>(
        async () =>
          new Response('', {
            status: 429,
            headers: { 'retry-after': header, 'x-request-id': 'safe-request' },
          }),
      );
      const sleep = vi.fn(async () => undefined);
      const client = new MetadataClient({
        configuration: configurationFixture({ retryCount: 2 }),
        fetch,
        sleep,
        now: () => NOW_MS,
      });
      await expect(client.lookup(requestFixture(), 'excessive')).rejects.toMatchObject({
        code: 'HTTP_ERROR',
        retriable: false,
        details: {
          status: 429,
          requestId: 'safe-request',
          retryAfterExceedsLimit: true,
          retryAfterLimitMs: 30_000,
        },
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it('ignores cooldown headers for other status codes and keeps the finite retry budget', async () => {
    const fetch = vi.fn<FetchLike>(
      async () => new Response('', { status: 500, headers: { 'retry-after': '99' } }),
    );
    const sleep = vi.fn(async () => undefined);
    const client = new MetadataClient({
      configuration: configurationFixture({ retryCount: 2, retryDelayMs: 40 }),
      fetch,
      sleep,
    });
    await expect(client.lookup(requestFixture(), 'budget')).rejects.toMatchObject({
      code: 'HTTP_ERROR',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toHaveLength(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 40, expect.any(AbortSignal));
  });

  it('does not sleep after the final allowed attempt', async () => {
    const fetch = vi.fn<FetchLike>(
      async () => new Response('', { status: 503, headers: { 'retry-after': '2' } }),
    );
    const sleep = vi.fn(async () => undefined);
    const client = new MetadataClient({
      configuration: configurationFixture({ retryCount: 0 }),
      fetch,
      sleep,
    });
    await expect(client.lookup(requestFixture(), 'no-retry')).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      details: { retryAfterMs: 2_000 },
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each(['caller', 'close'] as const)('cancels a pending server cooldown on %s', async (kind) => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>(
      async () => new Response('', { status: 503, headers: { 'retry-after': '30' } }),
    );
    const controller = new AbortController();
    const client = new MetadataClient({ configuration: configurationFixture(), fetch });
    const lookup = client.lookup(requestFixture(), 'cancel-cooldown', controller.signal);
    const rejected = expect(lookup).rejects.toMatchObject({
      code: kind === 'close' ? 'NODE_CLOSING' : 'CANCELLED',
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledOnce();
    if (kind === 'close') client.close();
    else controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(client.queueSnapshot().active).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
