/**
 * @file Service configuration validation.
 * @description Normalizes URLs and bounds timeout, response, retry, concurrency, and queue settings.
 * @exports ServiceConfiguration, parseServiceConfiguration.
 * @data HTTPS is mandatory except for loopback development; credentials in URLs are prohibited.
 */
import { z } from 'zod';
import { IntegrationError } from './integration-error';

const rawConfigurationSchema = z
  .object({
    baseUrl: z.string().min(1).max(2048),
    maxConcurrent: z.coerce.number().int().min(1).max(32),
    maxQueueDepth: z.coerce.number().int().min(0).max(1_000),
    maxResponseBytes: z.coerce.number().int().min(1_024).max(1_048_576),
    retryCount: z.coerce.number().int().min(0).max(2),
    retryDelayMs: z.coerce.number().int().min(0).max(5_000),
    timeoutMs: z.coerce.number().int().min(100).max(60_000),
  })
  .strict();

export interface ServiceConfiguration {
  readonly baseUrl: string;
  readonly maxConcurrent: number;
  readonly maxQueueDepth: number;
  readonly maxResponseBytes: number;
  readonly retryCount: number;
  readonly retryDelayMs: number;
  readonly timeoutMs: number;
}

/** Validates editor/runtime values and returns a normalized, immutable configuration. */
export function parseServiceConfiguration(value: unknown): ServiceConfiguration {
  const parsed = rawConfigurationSchema.safeParse(value);
  if (!parsed.success) {
    throw new IntegrationError('CONFIGURATION_ERROR', z.prettifyError(parsed.error), false);
  }

  let url: URL;
  try {
    url = new URL(parsed.data.baseUrl);
  } catch (error: unknown) {
    throw new IntegrationError(
      'CONFIGURATION_ERROR',
      'Base URL is not a valid URL',
      false,
      {},
      {
        cause: error,
      },
    );
  }

  if (url.username.length > 0 || url.password.length > 0) {
    throw new IntegrationError(
      'CONFIGURATION_ERROR',
      'Credentials must use the Node-RED credential field, not the URL',
      false,
    );
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new IntegrationError(
      'CONFIGURATION_ERROR',
      'Base URL cannot contain query parameters or a fragment',
      false,
    );
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new IntegrationError(
      'CONFIGURATION_ERROR',
      'HTTPS is required except for loopback development',
      false,
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return { ...parsed.data, baseUrl: url.toString().replace(/\/$/, '') };
}

/** Recognizes the exact loopback host spellings allowed to use development HTTP. */
function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
