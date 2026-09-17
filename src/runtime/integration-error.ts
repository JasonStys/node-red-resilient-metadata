/**
 * @file Stable integration error taxonomy.
 * @description Converts implementation failures into documented, secret-safe Node-RED messages.
 * @exports IntegrationError, IntegrationErrorCode, SerializedIntegrationError, toIntegrationError.
 * @data error codes remain stable across versions; details may contain only nonsecret primitives.
 */

export type IntegrationErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'CANCELLED'
  | 'CONFIGURATION_ERROR'
  | 'HTTP_ERROR'
  | 'INVALID_INPUT'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'NODE_CLOSING'
  | 'NOT_FOUND'
  | 'QUEUE_FULL'
  | 'RESPONSE_TOO_LARGE'
  | 'TIMEOUT';

export interface SerializedIntegrationError {
  readonly code: IntegrationErrorCode;
  readonly correlationId: string;
  readonly details: Readonly<Record<string, boolean | number | string>>;
  readonly message: string;
  readonly retriable: boolean;
}

export class IntegrationError extends Error {
  /** Captures a stable code, retry decision, safe details, and optional internal cause. */
  constructor(
    readonly code: IntegrationErrorCode,
    message: string,
    readonly retriable: boolean,
    readonly details: Readonly<Record<string, boolean | number | string>> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'IntegrationError';
  }

  /** Returns the credential-free shape permitted on a Node-RED message. */
  serialize(correlationId: string): SerializedIntegrationError {
    return {
      code: this.code,
      correlationId,
      details: this.details,
      message: this.message,
      retriable: this.retriable,
    };
  }
}

/** Maps unknown failures without leaking stack traces, credentials, or response bodies. */
export function toIntegrationError(error: unknown): IntegrationError {
  if (error instanceof IntegrationError) {
    return error;
  }
  return new IntegrationError(
    'NETWORK_ERROR',
    'Unexpected integration failure',
    true,
    {},
    {
      cause: error,
    },
  );
}
