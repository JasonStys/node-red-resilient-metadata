/**
 * @file Resilient product-metadata HTTP client.
 * @description Applies bounded concurrency, timeout, response limits, validation, and GET-only retry.
 * @exports MetadataClient, MetadataClientOptions, LookupOutcome, FetchLike, SleepFunction.
 * @data queue bounds all shared work; apiToken remains private; retry is capped by validated config.
 */
import { performance } from 'node:perf_hooks';
import { metadataRecordSchema, type LookupRequest, type MetadataRecord } from '../contracts';
import { BoundedWorkQueue, type QueueSnapshot } from './bounded-work-queue';
import type { ServiceConfiguration } from './configuration';
import { IntegrationError, toIntegrationError } from './integration-error';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type SleepFunction = (milliseconds: number, signal: AbortSignal) => Promise<void>;

export interface MetadataClientOptions {
  readonly apiToken?: string;
  readonly configuration: ServiceConfiguration;
  readonly fetch?: FetchLike;
  readonly sleep?: SleepFunction;
}

export interface LookupOutcome {
  readonly attempts: number;
  readonly durationMs: number;
  readonly record: MetadataRecord;
}

/** Shared client owned by the Node-RED configuration node. */
export class MetadataClient {
  readonly #apiToken: string | undefined;
  readonly #configuration: ServiceConfiguration;
  readonly #fetch: FetchLike;
  readonly #queue: BoundedWorkQueue;
  readonly #sleep: SleepFunction;

  /** Captures validated policy, hides the token, and creates the shared bounded queue. */
  constructor(options: MetadataClientOptions) {
    this.#apiToken = emptyToUndefined(options.apiToken);
    this.#configuration = options.configuration;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#sleep = options.sleep ?? abortableSleep;
    this.#queue = new BoundedWorkQueue(
      options.configuration.maxConcurrent,
      options.configuration.maxQueueDepth,
    );
  }

  /** Submits one typed lookup to the queue with optional caller cancellation. */
  lookup(
    request: LookupRequest,
    correlationId: string,
    signal?: AbortSignal,
  ): Promise<LookupOutcome> {
    return this.#queue.submit(
      (queueSignal) => this.#lookupWithRetry(request, correlationId, queueSignal),
      signal,
    );
  }

  /** Closes shared capacity and propagates shutdown to all work. */
  close(): void {
    this.#queue.close();
  }

  /** Exposes nonsecret queue counters for tests and operational inspection. */
  queueSnapshot(): QueueSnapshot {
    return this.#queue.snapshot();
  }

  /** Runs the capped idempotent retry loop and records end-to-end client duration. */
  async #lookupWithRetry(
    request: LookupRequest,
    correlationId: string,
    signal: AbortSignal,
  ): Promise<LookupOutcome> {
    const startedAt = performance.now();
    const totalAttempts = this.#configuration.retryCount + 1;
    let lastError: IntegrationError | undefined;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        const record = await this.#requestOnce(request, correlationId, signal);
        return {
          attempts: attempt,
          durationMs: Number((performance.now() - startedAt).toFixed(3)),
          record,
        };
      } catch (error: unknown) {
        lastError = toIntegrationError(error);
        if (!lastError.retriable || attempt === totalAttempts) {
          throw lastError;
        }
        await this.#sleep(this.#configuration.retryDelayMs, signal);
      }
    }

    throw lastError ?? new IntegrationError('NETWORK_ERROR', 'Metadata lookup failed', true);
  }

  /** Executes one deadline-bound GET and validates content, schema, and requested identity. */
  async #requestOnce(
    request: LookupRequest,
    correlationId: string,
    externalSignal: AbortSignal,
  ): Promise<MetadataRecord> {
    if (externalSignal.aborted) {
      throw cancellationFrom(externalSignal);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#configuration.timeoutMs);
    const forwardAbort = (): void => controller.abort(externalSignal.reason);
    externalSignal.addEventListener('abort', forwardAbort, { once: true });

    try {
      const url = buildLookupUrl(this.#configuration.baseUrl, request);
      const headers: Record<string, string> = {
        accept: 'application/json',
        'x-correlation-id': correlationId,
      };
      if (this.#apiToken !== undefined) {
        headers.authorization = `Bearer ${this.#apiToken}`;
      }

      const response = await this.#fetch(url, {
        headers,
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw httpError(response.status, response.headers.get('x-request-id'));
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('application/json')) {
        throw new IntegrationError(
          'INVALID_RESPONSE',
          'Metadata service did not return application/json',
          false,
          { contentType: contentType.slice(0, 80) || 'missing' },
        );
      }

      const body = await readBoundedBody(response, this.#configuration.maxResponseBytes);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(body);
      } catch (error: unknown) {
        throw new IntegrationError(
          'INVALID_RESPONSE',
          'Metadata service returned invalid JSON',
          false,
          {},
          { cause: error },
        );
      }
      const parsedRecord = metadataRecordSchema.safeParse(parsedJson);
      if (!parsedRecord.success) {
        throw new IntegrationError(
          'INVALID_RESPONSE',
          'Metadata response failed its schema contract',
          false,
          { issueCount: parsedRecord.error.issues.length },
        );
      }
      if (parsedRecord.data.productId !== request.productId) {
        throw new IntegrationError(
          'INVALID_RESPONSE',
          'Metadata response identity does not match the request',
          false,
        );
      }
      if (request.version !== undefined && parsedRecord.data.version !== request.version) {
        throw new IntegrationError(
          'INVALID_RESPONSE',
          'Metadata response version does not match the request',
          false,
        );
      }
      return parsedRecord.data;
    } catch (error: unknown) {
      if (error instanceof IntegrationError) {
        throw error;
      }
      if (externalSignal.aborted) {
        throw cancellationFrom(externalSignal);
      }
      if (timedOut) {
        throw new IntegrationError(
          'TIMEOUT',
          'Metadata service exceeded the configured deadline',
          true,
          { timeoutMs: this.#configuration.timeoutMs },
          { cause: error },
        );
      }
      throw new IntegrationError(
        'NETWORK_ERROR',
        'Metadata service request failed',
        true,
        {},
        {
          cause: error,
        },
      );
    } finally {
      clearTimeout(timeout);
      externalSignal.removeEventListener('abort', forwardAbort);
    }
  }
}

/** Encodes request routing fields into the fixed metadata endpoint. */
function buildLookupUrl(baseUrl: string, request: LookupRequest): URL {
  const url = new URL(`${baseUrl}/v1/products/${encodeURIComponent(request.productId)}`);
  url.searchParams.set('locale', request.locale);
  if (request.version !== undefined) {
    url.searchParams.set('version', request.version);
  }
  return url;
}

/** Buffers a response only up to maximumBytes, checking declared and streamed length. */
async function readBoundedBody(response: Response, maximumBytes: number): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > maximumBytes) {
    throw responseTooLarge(maximumBytes);
  }
  if (response.body === null) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel('response limit exceeded');
      throw responseTooLarge(maximumBytes);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

/** Classifies an HTTP status and retains only a small, bounded request identifier. */
function httpError(status: number, requestId: string | null): IntegrationError {
  const details: Record<string, number | string> = { status };
  if (requestId !== null && requestId.length <= 128) {
    details.requestId = requestId;
  }
  if (status === 401 || status === 403) {
    return new IntegrationError(
      'AUTHENTICATION_FAILED',
      'Metadata service rejected credentials',
      false,
      details,
    );
  }
  if (status === 404) {
    return new IntegrationError('NOT_FOUND', 'Product metadata was not found', false, details);
  }
  const retriable = status === 408 || status === 425 || status === 429 || status >= 500;
  return new IntegrationError(
    'HTTP_ERROR',
    `Metadata service returned HTTP ${status}`,
    retriable,
    details,
  );
}

/** Creates the stable response-cap error without including remote content. */
function responseTooLarge(maximumBytes: number): IntegrationError {
  return new IntegrationError(
    'RESPONSE_TOO_LARGE',
    'Metadata response exceeded the configured byte limit',
    false,
    { maximumBytes },
  );
}

/** Preserves service-close semantics while normalizing all other abort reasons. */
function cancellationFrom(signal: AbortSignal): IntegrationError {
  return signal.reason instanceof IntegrationError && signal.reason.code === 'NODE_CLOSING'
    ? signal.reason
    : new IntegrationError('CANCELLED', 'Metadata request was cancelled', false);
}

/** Waits between retries while removing its timer listener on completion or abort. */
function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(cancellationFrom(signal));
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(cancellationFrom(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Normalizes an empty optional credential without trimming or copying secret content. */
function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}
