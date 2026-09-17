/**
 * @file Contract and configuration boundary tests.
 * @description Covers defaults, strict schemas, URL policy, credentials, and numeric limits.
 * @exports Vitest test cases only.
 */
import { describe, expect, it } from 'vitest';
import { metadataRecordSchema, parseLookupRequest } from '../../src/contracts';
import { parseServiceConfiguration } from '../../src/runtime/configuration';
import { IntegrationError, toIntegrationError } from '../../src/runtime/integration-error';
import { configurationFixture, recordFixture } from './fixtures';

describe('message contracts', () => {
  it('applies the default locale to a valid request', () => {
    expect(parseLookupRequest({ productId: 'drive-200' })).toEqual({
      ok: true,
      value: { locale: 'en-US', productId: 'drive-200' },
    });
  });

  it('rejects extra fields and unsafe identifiers', () => {
    expect(parseLookupRequest({ productId: '../secret' }).ok).toBe(false);
    expect(parseLookupRequest({ productId: 'drive-200', unexpected: true }).ok).toBe(false);
  });

  it('requires HTTPS documentation links and a strict response shape', () => {
    expect(metadataRecordSchema.safeParse(recordFixture()).success).toBe(true);
    expect(
      metadataRecordSchema.safeParse(
        recordFixture({ documentation: [{ title: 'Guide', url: 'http://docs.example.test' }] }),
      ).success,
    ).toBe(false);
  });
});

describe('service configuration', () => {
  it('normalizes HTTPS and permits loopback HTTP', () => {
    expect(
      parseServiceConfiguration(configurationFixture({ baseUrl: 'https://example.test/api/' }))
        .baseUrl,
    ).toBe('https://example.test/api');
    expect(
      parseServiceConfiguration(configurationFixture({ baseUrl: 'http://127.0.0.1:4010' })).baseUrl,
    ).toBe('http://127.0.0.1:4010');
  });

  it.each([
    'http://metadata.example.test',
    'https://user:secret@metadata.example.test',
    'https://metadata.example.test?token=secret',
    'not-a-url',
  ])('rejects unsafe base URL %s', (baseUrl) => {
    expect(() => parseServiceConfiguration(configurationFixture({ baseUrl }))).toThrow(
      IntegrationError,
    );
  });

  it('rejects out-of-range queue and timeout settings', () => {
    expect(() => parseServiceConfiguration(configurationFixture({ maxConcurrent: 0 }))).toThrow(
      IntegrationError,
    );
    expect(() => parseServiceConfiguration(configurationFixture({ timeoutMs: 50 }))).toThrow(
      IntegrationError,
    );
  });
});

describe('IntegrationError', () => {
  it('serializes only stable safe fields', () => {
    const error = new IntegrationError('TIMEOUT', 'deadline exceeded', true, { timeoutMs: 500 });
    expect(error.serialize('corr-1')).toEqual({
      code: 'TIMEOUT',
      correlationId: 'corr-1',
      details: { timeoutMs: 500 },
      message: 'deadline exceeded',
      retriable: true,
    });
    expect(toIntegrationError(error)).toBe(error);
    expect(toIntegrationError(new Error('secret internal detail')).message).toBe(
      'Unexpected integration failure',
    );
  });
});
