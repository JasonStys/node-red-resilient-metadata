# Message Contract

## Input

The selected message property must be a strict object:

| Field       | Required | Rules                                                                      |
| ----------- | -------- | -------------------------------------------------------------------------- |
| `productId` | yes      | 1–64 characters; letters, digits, `.`, `_`, `-`; begins/ends alphanumeric. |
| `version`   | no       | Same identifier rules as `productId`.                                      |
| `locale`    | no       | BCP-47-shaped token; defaults to `en-US`.                                  |

Unknown properties are rejected. The portable contract is [`schemas/lookup-request.schema.json`](../schemas/lookup-request.schema.json).

## Success output

Output 1 preserves message fields, replaces `payload` with the validated record, and sets `metadataLookup`:

- `attempts`: number of HTTP attempts, including the successful attempt.
- `correlationId`: incoming `_msgid` or a generated UUID.
- `durationMs`: total queue-client duration measured with a monotonic clock.
- `productId`: normalized requested identifier.

Records contain `schemaVersion: "1.0"`, requested identity/version, display name, lifecycle, timestamp, up to 32 HTTPS documentation links, and bounded scalar metadata. See [`schemas/metadata-record.schema.json`](../schemas/metadata-record.schema.json).

## Failure output

Output 2 preserves the original input and sets `metadataError`:

| Code                    | Retriable | Meaning                                                        |
| ----------------------- | --------- | -------------------------------------------------------------- |
| `INVALID_INPUT`         | no        | Flow input failed the strict request contract.                 |
| `CONFIGURATION_ERROR`   | no        | Service settings are missing or unsafe.                        |
| `AUTHENTICATION_FAILED` | no        | Remote service returned 401/403.                               |
| `NOT_FOUND`             | no        | Remote service returned 404.                                   |
| `TIMEOUT`               | yes       | One request attempt exceeded its deadline.                     |
| `QUEUE_FULL`            | yes       | Waiting capacity was exhausted.                                |
| `NETWORK_ERROR`         | yes       | Fetch failed without an HTTP response.                         |
| `HTTP_ERROR`            | depends   | 408, 425, 429, and 5xx are eligible; other statuses are not.   |
| `RESPONSE_TOO_LARGE`    | no        | Declared or streamed body exceeded the byte cap.               |
| `INVALID_RESPONSE`      | no        | Media type, JSON, schema, or requested identity did not match. |
| `CANCELLED`             | no        | Caller cancelled the operation.                                |
| `NODE_CLOSING`          | no        | Service shutdown rejected or aborted work.                     |

Error details contain only small operational scalars such as status, timeout, or capacity. They never include the API token, Authorization header, response body, or arbitrary exception dump.

## Compatibility

The schema version is explicit. Backward-compatible additions should be optional and documented. Removing or changing an existing field, accepting a different semantic type, or changing output routing requires a major package version and a schema-version decision.
