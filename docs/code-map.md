# Code Map

Source line numbers drift as the project evolves, so this map uses stable symbols and searchable anchors.

| File                                | Anchor                          | Responsibility and important state                                            |
| ----------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `src/contracts.ts`                  | `lookupRequestSchema`           | Strict flow-input fields and defaults.                                        |
| `src/contracts.ts`                  | `metadataRecordSchema`          | Remote record shape, limits, documentation URL rule.                          |
| `src/contracts.ts`                  | `parseLookupRequest`            | Converts unknown message content to a discriminated result.                   |
| `src/runtime/configuration.ts`      | `rawConfigurationSchema`        | Numeric safety caps.                                                          |
| `src/runtime/configuration.ts`      | `parseServiceConfiguration`     | URL parse/normalize and loopback HTTPS exception.                             |
| `src/runtime/integration-error.ts`  | `IntegrationError`              | Stable code, retry flag, safe details, serialization.                         |
| `src/runtime/integration-error.ts`  | `toIntegrationError`            | Converts unknown exceptions without leaking internals.                        |
| `src/runtime/bounded-work-queue.ts` | `BoundedWorkQueue`              | Owns `pending`, `activeControllers`, close state, and metrics.                |
| `src/runtime/bounded-work-queue.ts` | `submit`                        | O(1) normal admission with immediate overflow rejection.                      |
| `src/runtime/bounded-work-queue.ts` | `#cancelPending`                | O(q) removal within the configured queue cap.                                 |
| `src/runtime/bounded-work-queue.ts` | `close`                         | Rejects waiting work and aborts active work once.                             |
| `src/runtime/metadata-client.ts`    | `MetadataClient`                | Private credential, validated policy, queue, fetch, sleep.                    |
| `src/runtime/metadata-client.ts`    | `#lookupWithRetry`              | Capped attempt loop and abortable delay.                                      |
| `src/runtime/metadata-client.ts`    | `#requestOnce`                  | Deadline, correlation/authorization headers, and error conversion.            |
| `src/runtime/metadata-client.ts`    | `readBoundedBody`               | Header precheck and streaming byte cap.                                       |
| `src/runtime/metadata-client.ts`    | `parseRetryAfter`               | Strict seconds/date parsing; 30-second server wait cap refuses early retry.   |
| `tests/unit/retry-after.test.ts`    | `server-directed retry spacing` | Fixed-clock cooldown, retry-budget, resource-cap and cancellation evidence.   |
| `src/nodes/metadata-service.ts`     | `MetadataServiceNode`           | Config validation, credentials, shared client ownership, close.               |
| `src/nodes/resilient-metadata.ts`   | `ResilientMetadataNode`         | Message handler, active controllers, status, output routing, done-once guard. |
| `src/nodes/resilient-metadata.ts`   | `routeError`                    | Adds safe error evidence and selects output 2.                                |
| `src/benchmark.ts`                  | `validationSamples`             | Fixed workload and broad time regression guard.                               |
| `examples/mock-service/server.mjs`  | `sendRecord`                    | Schema-valid deterministic example record.                                    |

Every TypeScript/JavaScript source and test file begins with a file header describing purpose, exports, and significant data. Public classes and boundary functions use nearby documentation comments; this map centralizes cross-file navigation without brittle hard-coded line references.

## Installed package acceptance locations

These new package-boundary entry points have exact authored line locations; update this table when editing the harness. Existing runtime anchors above remain searchable.

| File:line                                  | Function or important data                     | Responsibility                                                                                      |
| ------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `scripts/installed-consumer.mjs:17`        | `root`                                         | Trusted development host identity; never the product import root.                                   |
| `scripts/installed-consumer.mjs:20`        | `command`                                      | Identified JS entrypoint, clean environment, bounded child process.                                 |
| `scripts/installed-consumer.mjs:37`        | `npmCli`                                       | Existing official Node-layout npm CLI discovery.                                                    |
| `scripts/installed-consumer.mjs:55`        | `verifyInstalledConsumer`                      | Canonical owned consumer, pack/install, reviewed dependency identity, child acceptance and cleanup. |
| `tests/package/installed-node-red.mjs:18`  | `consumer`, `toolsRoot`, `registrations`       | Physical installed product boundary separate from locked host framework.                            |
| `tests/package/installed-node-red.mjs:52`  | `bounded`                                      | Absolute wait deadline independent of the product timeout.                                          |
| `tests/package/installed-node-red.mjs:70`  | `callback`                                     | Deadline-bound real runtime server lifecycle.                                                       |
| `tests/package/installed-node-red.mjs:77`  | `providerEvents`, `mode`, `requests`, `record` | Synthetic provider state and independent observed request counters.                                 |
| `tests/package/installed-node-red.mjs:93`  | `provider`                                     | Actual owned HTTP success/failure/cooldown/held-socket fixture.                                     |
| `tests/package/installed-node-red.mjs:122` | `flow`                                         | Fresh installed-node flow with protected synthetic credentials.                                     |
| `tests/package/installed-node-red.mjs:158` | `message`                                      | Actual output event with independent deadline.                                                      |
| `tests/package/installed-node-red.mjs:164` | `send`                                         | Fixed synthetic input through the installed runtime node.                                           |
| `tests/package/installed-node-red.mjs:170` | `started`, `checks`                            | Owned-resource lifetime and seven-case acceptance record.                                           |
