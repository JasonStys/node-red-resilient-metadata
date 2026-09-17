# Node-RED Resilient Metadata

[![CI](https://github.com/JasonStys/node-red-resilient-metadata/actions/workflows/ci.yml/badge.svg)](https://github.com/JasonStys/node-red-resilient-metadata/actions/workflows/ci.yml)
[![CodeQL](https://github.com/JasonStys/node-red-resilient-metadata/actions/workflows/codeql.yml/badge.svg)](https://github.com/JasonStys/node-red-resilient-metadata/actions/workflows/codeql.yml)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

An installable TypeScript package that adds a reusable product-metadata lookup node to Node-RED. It treats reliability as part of the public contract: untrusted messages and remote responses are schema-validated, concurrency and waiting work are bounded, credentials stay in Node-RED's credential store, safe GET retries are capped, and in-flight work is cancelled during redeploy.

The repository includes a dependency-free mock service, importable flows for normal and failure scenarios, JSON Schemas, an npm tarball build, unit and real-runtime integration tests, coverage enforcement, a performance regression guard, and GitHub security automation.

## Why this project is useful

Integration nodes live at a trust boundary. A small amount of code may receive arbitrary flow messages, hold credentials, call an unreliable service, and be stopped at any time. This package demonstrates how to make those boundaries explicit without turning a two-node package into a framework.

- **Predictable load:** configurable concurrency and queue caps prevent unbounded work.
- **Safe lifecycle:** active requests and queued jobs are cancelled on close or redeploy.
- **Useful failures:** validation, authentication, not-found, timeout, capacity, transport, HTTP, and response-contract failures have stable codes.
- **Protected secrets:** the API token uses Node-RED credentials and is absent from exported flows and errors.
- **Operational visibility:** node status and `msg.metadataLookup` expose state, attempts, correlation, and duration.
- **Portable evidence:** CI runs on Windows and Linux, CodeQL scans TypeScript/JavaScript, and the produced `.tgz` is installable.

## Quick start

Requirements: Node.js 22 or newer and pnpm 11.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm pack:artifact
```

Install the generated tarball into a Node-RED user directory:

```bash
npm install /absolute/path/to/node-red-contrib-resilient-metadata-1.0.0.tgz
```

Restart Node-RED, then import [`examples/flows/reliability-demo.json`](examples/flows/reliability-demo.json). Start the local simulator in another terminal:

```bash
set METADATA_DEMO_TOKEN=demo-token
node examples/mock-service/server.mjs
```

On PowerShell, use `$env:METADATA_DEMO_TOKEN = 'demo-token'`. Edit the imported **Local mock service** config node and enter the same token; Node-RED deliberately does not export credentials with a flow. The optional MQTT output is disabled from auto-connecting and expects a broker at `127.0.0.1:1883` if enabled.

## Message contract

The runtime reads `msg.payload` by default:

```json
{
  "productId": "drive-200",
  "version": "2.4.1",
  "locale": "en-US"
}
```

Output 1 replaces `msg.payload` with a validated metadata record and adds evidence:

```json
{
  "metadataLookup": {
    "attempts": 1,
    "correlationId": "2f22c9...",
    "durationMs": 12.483,
    "productId": "drive-200"
  }
}
```

Output 2 preserves the original message and adds a safe error:

```json
{
  "metadataError": {
    "code": "TIMEOUT",
    "message": "Metadata service exceeded the configured deadline",
    "retriable": true,
    "correlationId": "2f22c9...",
    "details": { "timeoutMs": 500 }
  }
}
```

The complete schemas and compatibility rules are in [`docs/message-contract.md`](docs/message-contract.md).

## Major components

| Component             | Responsibility                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `metadata-service`    | Shared config node that validates connection policy, reads the protected token, and owns one bounded client.               |
| `resilient-metadata`  | Runtime node that validates an input property, calls the client, updates status, and routes success or structured failure. |
| `MetadataClient`      | Builds an encoded GET, applies a deadline and response-size cap, validates JSON, and retries only eligible failures.       |
| `BoundedWorkQueue`    | Maintains FIFO waiting work, concurrency/capacity limits, cancellation propagation, and shutdown behavior.                 |
| Contract schemas      | Keep flow input, service output, documentation URLs, identifiers, and version fields deterministic at runtime.             |
| Mock service and flow | Reproduce success, transient retry, timeout, malformed response, invalid input, and MQTT forwarding locally.               |

## Repository map

| Path                                         | Summary                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                   | Cross-platform formatting, lint, type, unit, integration, build, benchmark, and package checks.    |
| `.github/workflows/codeql.yml`               | JavaScript/TypeScript static security analysis.                                                    |
| `.github/dependabot.yml`                     | Weekly npm and Actions dependency review.                                                          |
| `editor/metadata-service.html`               | Config-node editor, credential control, numeric validation, and inline help.                       |
| `editor/resilient-metadata.html`             | Runtime-node editor, two-output definition, and message help.                                      |
| `examples/flows/reliability-demo.json`       | Importable normal, retry, timeout, malformed, invalid-input, and MQTT flow.                        |
| `examples/mock-service/server.mjs`           | Local dependency-free simulator with deterministic failure modes.                                  |
| `schemas/lookup-request.schema.json`         | Portable input JSON Schema.                                                                        |
| `schemas/metadata-record.schema.json`        | Portable service-response JSON Schema.                                                             |
| `scripts/clean.mjs`                          | Cross-platform compiled-output cleanup.                                                            |
| `scripts/copy-editor.mjs`                    | Places Node-RED editor assets beside compiled runtime files.                                       |
| `scripts/verify-package.mjs`                 | Confirms required runtime/editor/schema files exist before packaging.                              |
| `src/contracts.ts`                           | Zod request/record schemas and untrusted-input parser.                                             |
| `src/benchmark.ts`                           | Validation throughput and queue-drain regression guard.                                            |
| `src/nodes/metadata-service.ts`              | Shared configuration-node registration and lifecycle.                                              |
| `src/nodes/resilient-metadata.ts`            | Message processing, status, output routing, and per-node close handling.                           |
| `src/nodes/node-types.ts`                    | Typed contract between the two Node-RED nodes.                                                     |
| `src/runtime/bounded-work-queue.ts`          | Bounded FIFO scheduler with abort and close semantics.                                             |
| `src/runtime/configuration.ts`               | URL normalization and numeric policy validation.                                                   |
| `src/runtime/integration-error.ts`           | Stable error taxonomy and safe serialization.                                                      |
| `src/runtime/metadata-client.ts`             | HTTP boundary, retry policy, byte cap, schema checks, and correlation headers.                     |
| `src/types/node-red-node-test-helper.d.ts`   | Minimal local typings for the official untyped test helper.                                        |
| `tests/unit/`                                | Fast deterministic tests for contracts, configuration, queueing, errors, and HTTP behavior.        |
| `tests/integration/node-red-runtime.test.ts` | Real Node-RED helper tests for routing, credentials, status lifecycle, and unload cancellation.    |
| `docs/`                                      | Architecture, operations, security, contracts, testing, decisions, code map, and recorded reports. |

Generated `dist/`, `coverage/`, `artifacts/`, and `.tgz` files are intentionally ignored. CI publishes coverage and the installable tarball as run artifacts.

## Commands

| Command                 | Purpose                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `pnpm format:check`     | Verify repository formatting.                                         |
| `pnpm lint`             | Run type-aware ESLint rules.                                          |
| `pnpm typecheck`        | Compile-check all source and tests without emitting.                  |
| `pnpm test`             | Run unit tests with enforced coverage thresholds.                     |
| `pnpm test:integration` | Load the nodes in the official Node-RED test runtime.                 |
| `pnpm build`            | Compile declarations/source maps and copy editor assets.              |
| `pnpm benchmark`        | Exercise validation and queue hot paths with broad regression guards. |
| `pnpm verify`           | Run the complete local quality gate.                                  |
| `pnpm pack:artifact`    | Produce an installable npm tarball under `artifacts/`.                |

## Documentation

- [`Architecture`](docs/architecture.md)
- [`Message contract`](docs/message-contract.md)
- [`Operations`](docs/operations.md)
- [`Security`](docs/security.md)
- [`Testing strategy`](docs/testing.md)
- [`Development guide`](docs/development.md)
- [`Code map`](docs/code-map.md)
- [`Decision record`](docs/decisions/0001-bounded-shared-client.md)
- [`Verification reports`](docs/reports/verification-report.md)

## License

MIT — see [`LICENSE`](LICENSE).
