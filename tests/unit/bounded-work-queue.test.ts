/**
 * @file Bounded asynchronous queue tests.
 * @description Verifies FIFO, concurrency, overflow, cancellation, close, and statistics behavior.
 * @exports Vitest test cases only.
 */
import { describe, expect, it } from 'vitest';
import { BoundedWorkQueue } from '../../src/runtime/bounded-work-queue';
import { IntegrationError } from '../../src/runtime/integration-error';

describe('BoundedWorkQueue', () => {
  it('rejects invalid constructor bounds', () => {
    expect(() => new BoundedWorkQueue(0, 1)).toThrow(RangeError);
    expect(() => new BoundedWorkQueue(1, -1)).toThrow(RangeError);
  });

  it('runs at the concurrency limit and drains waiting work in FIFO order', async () => {
    const queue = new BoundedWorkQueue(1, 2);
    const first = deferred<void>();
    const order: number[] = [];
    const p1 = queue.submit(async () => {
      order.push(1);
      await first.promise;
      return 'first';
    });
    const p2 = queue.submit(async () => {
      order.push(2);
      return 'second';
    });
    const p3 = queue.submit(async () => {
      order.push(3);
      return 'third';
    });

    expect(queue.snapshot()).toMatchObject({ active: 1, highWaterMark: 2, pending: 2 });
    first.resolve();
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual(['first', 'second', 'third']);
    expect(order).toEqual([1, 2, 3]);
  });

  it('rejects overflow without starting excess work', async () => {
    const queue = new BoundedWorkQueue(1, 0);
    const blocker = deferred<void>();
    const active = queue.submit(async () => blocker.promise);
    await expect(queue.submit(async () => 'never')).rejects.toMatchObject({ code: 'QUEUE_FULL' });
    expect(queue.snapshot().rejected).toBe(1);
    blocker.resolve();
    await active;
  });

  it('removes a cancelled waiting job', async () => {
    const queue = new BoundedWorkQueue(1, 2);
    const blocker = deferred<void>();
    const active = queue.submit(async () => blocker.promise);
    const controller = new AbortController();
    const waiting = queue.submit(async () => 'never', controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(queue.snapshot().pending).toBe(0);
    blocker.resolve();
    await active;
  });

  it('aborts active work, rejects pending work, and refuses work after close', async () => {
    const queue = new BoundedWorkQueue(1, 1);
    const active = queue.submit(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason instanceof Error ? signal.reason : new Error('aborted')),
            { once: true },
          );
        }),
    );
    const pending = queue.submit(async () => 'pending');
    queue.close();
    queue.close();

    await expect(active).rejects.toMatchObject({ code: 'NODE_CLOSING' });
    await expect(pending).rejects.toMatchObject({ code: 'NODE_CLOSING' });
    await expect(queue.submit(async () => 'late')).rejects.toBeInstanceOf(IntegrationError);
    expect(queue.snapshot()).toMatchObject({ active: 0, closed: true, pending: 0 });
  });
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value?: T) => void;
} {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (value) => resolvePromise(value as T) };
}
