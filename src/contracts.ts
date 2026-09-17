/**
 * @file Public request, response, and Node-RED message contracts.
 * @description Validates untrusted flow input and remote service responses at runtime.
 * @exports LookupRequest, MetadataRecord, lookupRequestSchema, metadataRecordSchema, parseLookupRequest.
 * @data identifier patterns bound routing fields; schemas reject unknown properties and unsafe URLs.
 */
import { z } from 'zod';

const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/);

export const lookupRequestSchema = z
  .object({
    locale: z
      .string()
      .min(2)
      .max(35)
      .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
      .default('en-US'),
    productId: identifier,
    version: identifier.optional(),
  })
  .strict();

export const metadataRecordSchema = z
  .object({
    displayName: z.string().min(1).max(160),
    documentation: z
      .array(
        z
          .object({
            title: z.string().min(1).max(160),
            url: z.url().refine((value) => value.startsWith('https://'), {
              message: 'documentation URLs must use HTTPS',
            }),
          })
          .strict(),
      )
      .max(32),
    lifecycle: z.enum(['active', 'deprecated', 'end-of-life', 'preview']),
    metadata: z
      .record(
        z.string().min(1).max(64),
        z.union([z.boolean(), z.number().finite(), z.string().max(512)]),
      )
      .default({}),
    productId: identifier,
    schemaVersion: z.literal('1.0'),
    sourceTimestamp: z.string().datetime({ offset: true }),
    version: identifier,
  })
  .strict();

export type LookupRequest = z.infer<typeof lookupRequestSchema>;
export type MetadataRecord = z.infer<typeof metadataRecordSchema>;

export type LookupRequestResult =
  | { readonly ok: true; readonly value: LookupRequest }
  | { readonly error: string; readonly ok: false };

/** Converts an arbitrary message property into a stable lookup request or actionable error. */
export function parseLookupRequest(value: unknown): LookupRequestResult {
  const result = lookupRequestSchema.safeParse(value);
  return result.success
    ? { ok: true, value: result.data }
    : { error: z.prettifyError(result.error), ok: false };
}
