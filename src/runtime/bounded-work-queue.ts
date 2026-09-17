/**
 * @file Bounded asynchronous work queue.
 * @description Caps active requests and waiting work while propagating cancellation and shutdown.
 * @exports BoundedWorkQueue, QueueSnapshot.
 * @data pending never exceeds maxQueueDepth; activeControllers owns every running operation.
 */
import { IntegrationError } from './integration-error';

export interface QueueSnapshot {
  readonly active: number;
  readonly closed: boolean;
  readonly highWaterMark: number;
  readonly pending: number;
  readonly rejected: number;
}

interface PendingJob {
  readonly execute: (signal: AbortSignal) => Promise<void>;
  readonly externalSignal: AbortSignal | undefined;
  readonly reject: (error: IntegrationError) => void;
  pendingAbortListener: (() => void) | undefined;
}

/** FIFO queue with explicit concurrency, capacity, cancellation, and close behavior. */
export class BoundedWorkQueue {
  readonly #activeControllers = new Set<AbortController>();
  readonly #maxConcurrent: number;
  readonly #maxQueueDepth: number;
  readonly #pending: PendingJob[] = [];
  #closed = false;
  #highWaterMark = 0;
  #rejected = 0;

  /** Stores immutable active/waiting limits after validating safe integer bounds. */
  constructor(maxConcurrent: number, maxQueueDepth: number) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new RangeError('maxConcurrent must be a positive safe integer');
    }
    if (!Number.isSafeInteger(maxQueueDepth) || maxQueueDepth < 0) {
      throw new RangeError('maxQueueDepth must be a non-negative safe integer');
    }
    this.#maxConcurrent = maxConcurrent;
    this.#maxQueueDepth = maxQueueDepth;
  }

  /** Admits work immediately or to FIFO waiting storage, rejecting closed/full/cancelled input. */
  submit<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    if (this.#closed) {
      return Promise.reject(nodeClosingError());
    }
    if (externalSignal?.aborted === true) {
      return Promise.reject(cancelledError());
    }

    return new Promise<T>((resolve, reject) => {
      const job: PendingJob = {
        execute: async (signal) => {
          try {
            resolve(await operation(signal));
          } catch (error: unknown) {
            reject(error instanceof Error ? error : new Error('Queued operation failed'));
          }
        },
        externalSignal,
        pendingAbortListener: undefined,
        reject,
      };

      if (this.#activeControllers.size < this.#maxConcurrent) {
        this.#start(job);
        return;
      }
      if (this.#pending.length >= this.#maxQueueDepth) {
        this.#rejected += 1;
        reject(
          new IntegrationError('QUEUE_FULL', 'Metadata request queue is full', true, {
            maxQueueDepth: this.#maxQueueDepth,
          }),
        );
        return;
      }

      this.#pending.push(job);
      this.#highWaterMark = Math.max(this.#highWaterMark, this.#pending.length);
      if (externalSignal !== undefined) {
        job.pendingAbortListener = () => this.#cancelPending(job);
        externalSignal.addEventListener('abort', job.pendingAbortListener, { once: true });
      }
    });
  }

  /** Idempotently rejects waiting work and aborts every active operation. */
  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    for (const job of this.#pending.splice(0)) {
      this.#removePendingAbortListener(job);
      job.reject(nodeClosingError());
    }
    for (const controller of this.#activeControllers) {
      controller.abort(nodeClosingError());
    }
  }

  /** Returns immutable operational counters without exposing jobs or controllers. */
  snapshot(): QueueSnapshot {
    return {
      active: this.#activeControllers.size,
      closed: this.#closed,
      highWaterMark: this.#highWaterMark,
      pending: this.#pending.length,
      rejected: this.#rejected,
    };
  }

  /** Moves one job to active state and guarantees controller/listener cleanup. */
  #start(job: PendingJob): void {
    this.#removePendingAbortListener(job);
    const controller = new AbortController();
    const forwardAbort = (): void => controller.abort(cancelledError());
    job.externalSignal?.addEventListener('abort', forwardAbort, { once: true });
    this.#activeControllers.add(controller);

    void job.execute(controller.signal).finally(() => {
      job.externalSignal?.removeEventListener('abort', forwardAbort);
      this.#activeControllers.delete(controller);
      this.#drain();
    });
  }

  /** Removes one externally cancelled waiting job within the configured O(q) bound. */
  #cancelPending(job: PendingJob): void {
    const index = this.#pending.indexOf(job);
    if (index >= 0) {
      this.#pending.splice(index, 1);
      this.#removePendingAbortListener(job);
      job.reject(cancelledError());
    }
  }

  /** Detaches and clears a waiting job's abort listener when ownership changes. */
  #removePendingAbortListener(job: PendingJob): void {
    if (job.externalSignal !== undefined && job.pendingAbortListener !== undefined) {
      job.externalSignal.removeEventListener('abort', job.pendingAbortListener);
      job.pendingAbortListener = undefined;
    }
  }

  /** Starts FIFO jobs until the active limit is reached or waiting work is exhausted. */
  #drain(): void {
    while (
      !this.#closed &&
      this.#activeControllers.size < this.#maxConcurrent &&
      this.#pending.length > 0
    ) {
      const next = this.#pending.shift();
      if (next !== undefined) {
        this.#start(next);
      }
    }
  }
}

/** Creates the stable error used for caller-driven cancellation. */
function cancelledError(): IntegrationError {
  return new IntegrationError('CANCELLED', 'Metadata request was cancelled', false);
}

/** Creates the stable error used when the queue can no longer accept or retain work. */
function nodeClosingError(): IntegrationError {
  return new IntegrationError('NODE_CLOSING', 'Metadata service is closing', false);
}
