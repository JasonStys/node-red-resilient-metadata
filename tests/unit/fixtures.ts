/**
 * @file Shared metadata test fixtures.
 * @description Produces valid requests, records, and service configurations for focused tests.
 * @exports requestFixture, recordFixture, configurationFixture, jsonResponse.
 * @data fixture values are deterministic, synthetic, and contain no credentials.
 */
import type { LookupRequest, MetadataRecord } from '../../src/contracts';
import type { ServiceConfiguration } from '../../src/runtime/configuration';

export function requestFixture(overrides: Partial<LookupRequest> = {}): LookupRequest {
  return { locale: 'en-US', productId: 'drive-200', version: '2.4.1', ...overrides };
}

export function recordFixture(overrides: Partial<MetadataRecord> = {}): MetadataRecord {
  return {
    displayName: 'Synthetic Drive 200',
    documentation: [{ title: 'Installation guide', url: 'https://docs.example.test/drive-200' }],
    lifecycle: 'active',
    metadata: { family: 'motion', supportsEthernet: true },
    productId: 'drive-200',
    schemaVersion: '1.0',
    sourceTimestamp: '2026-01-15T12:00:00.000Z',
    version: '2.4.1',
    ...overrides,
  };
}

export function configurationFixture(
  overrides: Partial<ServiceConfiguration> = {},
): ServiceConfiguration {
  return {
    baseUrl: 'https://metadata.example.test',
    maxConcurrent: 2,
    maxQueueDepth: 4,
    maxResponseBytes: 16_384,
    retryCount: 1,
    retryDelayMs: 0,
    timeoutMs: 1_000,
    ...overrides,
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}
