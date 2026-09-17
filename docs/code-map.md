# Code Map

Source line numbers drift as the project evolves, so this map uses stable symbols and searchable anchors.

| File                                | Anchor                      | Responsibility and important state                                            |
| ----------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `src/contracts.ts`                  | `lookupRequestSchema`       | Strict flow-input fields and defaults.                                        |
| `src/contracts.ts`                  | `metadataRecordSchema`      | Remote record shape, limits, documentation URL rule.                          |
| `src/contracts.ts`                  | `parseLookupRequest`        | Converts unknown message content to a discriminated result.                   |
| `src/runtime/configuration.ts`      | `rawConfigurationSchema`    | Numeric safety caps.                                                          |
| `src/runtime/configuration.ts`      | `parseServiceConfiguration` | URL parse/normalize and loopback HTTPS exception.                             |
| `src/runtime/integration-error.ts`  | `IntegrationError`          | Stable code, retry flag, safe details, serialization.                         |
| `src/runtime/integration-error.ts`  | `toIntegrationError`        | Converts unknown exceptions without leaking internals.                        |
| `src/runtime/bounded-work-queue.ts` | `BoundedWorkQueue`          | Owns `pending`, `activeControllers`, close state, and metrics.                |
| `src/runtime/bounded-work-queue.ts` | `submit`                    | O(1) normal admission with immediate overflow rejection.                      |
| `src/runtime/bounded-work-queue.ts` | `#cancelPending`            | O(q) removal within the configured queue cap.                                 |
| `src/runtime/bounded-work-queue.ts` | `close`                     | Rejects waiting work and aborts active work once.                             |
| `src/runtime/metadata-client.ts`    | `MetadataClient`            | Private credential, validated policy, queue, fetch, sleep.                    |
| `src/runtime/metadata-client.ts`    | `#lookupWithRetry`          | Capped attempt loop and abortable delay.                                      |
| `src/runtime/metadata-client.ts`    | `#requestOnce`              | Deadline, correlation/authorization headers, and error conversion.            |
| `src/runtime/metadata-client.ts`    | `readBoundedBody`           | Header precheck and streaming byte cap.                                       |
| `src/nodes/metadata-service.ts`     | `MetadataServiceNode`       | Config validation, credentials, shared client ownership, close.               |
| `src/nodes/resilient-metadata.ts`   | `ResilientMetadataNode`     | Message handler, active controllers, status, output routing, done-once guard. |
| `src/nodes/resilient-metadata.ts`   | `routeError`                | Adds safe error evidence and selects output 2.                                |
| `src/benchmark.ts`                  | `validationSamples`         | Fixed workload and broad time regression guard.                               |
| `examples/mock-service/server.mjs`  | `sendRecord`                | Schema-valid deterministic example record.                                    |

Every TypeScript/JavaScript source and test file begins with a file header describing purpose, exports, and significant data. Public classes and boundary functions use nearby documentation comments; this map centralizes cross-file navigation without brittle hard-coded line references.
