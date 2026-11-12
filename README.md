# Node-RED Resilient Metadata

[![CI](https://github.com/JasonStys/node-red-resilient-metadata/actions/workflows/ci.yml/badge.svg)](https://github.com/JasonStys/node-red-resilient-metadata/actions/workflows/ci.yml)
[![CodeQL](https://github.com/JasonStys/node-red-resilient-metadata/actions/workflows/codeql.yml/badge.svg)](https://github.com/JasonStys/node-red-resilient-metadata/actions/workflows/codeql.yml)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

An installable TypeScript package that adds a reusable product-metadata lookup node to Node-RED. It treats reliability as part of the public contract: untrusted messages and remote responses are schema-validated, concurrency and waiting work are bounded, credentials stay in Node-RED's credential store, safe GET retries are capped, and in-flight work is cancelled during redeploy.

The repository includes a dependency-free mock service, importable flows for normal and failure scenarios, JSON Schemas, an npm tarball build, unit and real-runtime integration tests, coverage enforcement, a performance regression guard, and GitHub security automation. Package acceptance also installs the final `.tgz` outside the source tree and runs its shipped nodes in the official Node-RED helper against a real, owned loopback HTTP provider.

## Native Windows workbench

The native Windows workbench adds a complete authoring and reliability-review workflow to this same project. Edit message batches, authorized synthetic provider records, queue/concurrency limits, deadlines and retries; save and execute the **actual shipped nodes in genuine Node-RED 5.0.8**. Inspect each original output/completion, request trace and queue state. Exercise real 429/503 retries, response failures and held-request cancellation/redeployment. Quit retains accepted I/O and the actual provider/child until normal completion.

Projects and exact project/run pairs survive restart in a plaintext owner-local workspace. Ten runs and 16 MiB bound history, with explicit eviction counts. Import/export projects, export an exact run or export a credential-free ordinary Node-RED flow for independent approved integration. The native provider is owned numeric loopback only; no arbitrary-code editor, external endpoint or automatic MQTT connection is exposed. The original installable node package remains available for independently configured real services.

The unsigned Windows x64 portable build bundles Electron and Node-RED; end users need no Node.js, pnpm, Python or IDE. New native source is under review; a public download is available only after a separately reviewed release is published. See the [native guide](docs/native-application.md), [component provenance](docs/native-npm-component.md), [tests](docs/testing.md) and [exact source declarations](docs/code-map.md). Existing published assets are unchanged.

## Why this project is useful

Integration nodes live at a trust boundary. A small amount of code may receive arbitrary flow messages, hold credentials, call an unreliable service, and be stopped at any time. This package demonstrates how to make those boundaries explicit without turning a two-node package into a framework.

- **Predictable load:** configurable concurrency and queue caps prevent unbounded work.
- **Safe lifecycle:** active requests and queued jobs are cancelled on close or redeploy.
- **Provider-aware retries:** HTTP 429/503 cooldowns use `Retry-After` seconds or HTTP dates, retain configured minimum spacing, and cancel on redeploy. Cooldowns above 30 seconds go to the error output for later recovery instead of sending an early retry.
- **Useful failures:** validation, authentication, not-found, timeout, capacity, transport, HTTP, and response-contract failures have stable codes.
- **Protected secrets:** the API token uses Node-RED credentials and is absent from exported flows and errors.
- **Operational visibility:** node status and `msg.metadataLookup` expose state, attempts, correlation, and duration.
- **Portable evidence:** CI runs on Windows and Linux, CodeQL scans TypeScript/JavaScript, and the produced `.tgz` is installable.

## Quick start

For source validation: Node.js 22.22.2+ or 24.15+, pnpm 11 and Python 3.14.10 for verified component preparation. The public node package itself retains its Node.js 22+ / Zod contract. Native app users need none of these build tools.

Cold checkouts include the exact third-party component TAR used by both frozen parent locks. This lets dependency updaters resolve the original Node-RED development host without running a project preparation script. The following preparation commands independently reproduce and compare that input; a changed tracked TAR fails before a download or source write. See the [updater source-input report](docs/reports/dependabot-source-input-2026-11-12.md) for the actual missing-file failure, retained supply-chain defaults and validation limits.

```bash
corepack enable
python scripts/prepare-npm-component.py --download
python scripts/prepare-npm-component.py --package
pnpm install --frozen-lockfile
pnpm verify
pnpm pack:artifact
```

Install the generated tarball into a Node-RED user directory:

```bash
npm install /absolute/path/to/node-red-contrib-resilient-metadata-1.1.0.tgz
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

| Path                                         | Summary                                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                   | Cross-platform formatting, lint, type, unit, integration, build, benchmark, and package checks.                   |
| `.github/workflows/codeql.yml`               | JavaScript/TypeScript static security analysis.                                                                   |
| `.github/dependabot.yml`                     | Weekly npm and Actions dependency review.                                                                         |
| `editor/metadata-service.html`               | Config-node editor, credential control, numeric validation, and inline help.                                      |
| `editor/resilient-metadata.html`             | Runtime-node editor, two-output definition, and message help.                                                     |
| `examples/flows/reliability-demo.json`       | Importable normal, retry, timeout, malformed, invalid-input, and MQTT flow.                                       |
| `examples/mock-service/server.mjs`           | Local dependency-free simulator with deterministic failure modes.                                                 |
| `schemas/lookup-request.schema.json`         | Portable input JSON Schema.                                                                                       |
| `schemas/metadata-record.schema.json`        | Portable service-response JSON Schema.                                                                            |
| `scripts/clean.mjs`                          | Cross-platform compiled-output cleanup.                                                                           |
| `scripts/copy-editor.mjs`                    | Places Node-RED editor assets beside compiled runtime files.                                                      |
| `scripts/verify-package.mjs`                 | Confirms required files, then invokes isolated installed-package acceptance.                                      |
| `scripts/installed-consumer.mjs`             | Packs/installs a private consumer, binds reviewed Zod integrity, and runs its native acceptance process.          |
| `tests/package/installed-node-red.mjs`       | Loads only installed manifest registrations in the real Node-RED helper with actual HTTP and unload cancellation. |
| `src/contracts.ts`                           | Zod request/record schemas and untrusted-input parser.                                                            |
| `src/benchmark.ts`                           | Validation throughput and queue-drain regression guard.                                                           |
| `src/nodes/metadata-service.ts`              | Shared configuration-node registration and lifecycle.                                                             |
| `src/nodes/resilient-metadata.ts`            | Message processing, status, output routing, and per-node close handling.                                          |
| `src/nodes/node-types.ts`                    | Typed contract between the two Node-RED nodes.                                                                    |
| `src/runtime/bounded-work-queue.ts`          | Bounded FIFO scheduler with abort and close semantics.                                                            |
| `src/runtime/configuration.ts`               | URL normalization and numeric policy validation.                                                                  |
| `src/runtime/integration-error.ts`           | Stable error taxonomy and safe serialization.                                                                     |
| `src/runtime/metadata-client.ts`             | HTTP boundary, retry policy, byte cap, schema checks, and correlation headers.                                    |
| `src/types/node-red-node-test-helper.d.ts`   | Minimal local typings for the official untyped test helper.                                                       |
| `tests/unit/`                                | Fast deterministic tests for contracts, configuration, queueing, errors, and HTTP behavior.                       |
| `tests/integration/node-red-runtime.test.ts` | Real Node-RED helper tests for routing, credentials, status lifecycle, and unload cancellation.                   |
| `docs/`                                      | Architecture, operations, security, contracts, testing, decisions, code map, and recorded reports.                |

Generated `dist/`, `coverage/`, `artifacts/`, and `.tgz` files are intentionally ignored. CI publishes coverage and the installable tarball as run artifacts.

## Commands

| Command                             | Purpose                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                 | Verify repository formatting.                                                                        |
| `pnpm lint`                         | Run type-aware ESLint rules.                                                                         |
| `pnpm typecheck`                    | Compile-check all source and tests without emitting.                                                 |
| `pnpm test`                         | Run unit tests with enforced coverage thresholds.                                                    |
| `pnpm test:integration`             | Load the nodes in the official Node-RED test runtime.                                                |
| `pnpm build`                        | Compile declarations/source maps and copy editor assets.                                             |
| `pnpm benchmark`                    | Exercise validation and queue hot paths with broad regression guards.                                |
| `pnpm package:verify`               | After building, install the final TGZ in a private consumer and run seven actual HTTP/runtime cases. |
| `pnpm audit --audit-level=moderate` | Audit the complete development and production dependency graph.                                      |
| `pnpm verify`                       | Run the complete local quality gate.                                                                 |
| `pnpm pack:artifact`                | Produce an installable npm tarball under `artifacts/`.                                               |

## Documentation

- [`Architecture`](docs/architecture.md)
- [`Message contract`](docs/message-contract.md)
- [`Operations`](docs/operations.md)
- [`Security`](docs/security.md)
- [`Testing strategy`](docs/testing.md)
- [`Development guide`](docs/development.md)
- [`Code map`](docs/code-map.md)
- [`Decision record`](docs/decisions/0001-bounded-shared-client.md)
- [`Installed-package validation`](docs/reports/installed-consumer-2026-11-09.md)
- [`Historical verification report`](docs/reports/verification-report.md)
- [`Latest maintenance audit`](docs/reports/maintenance-audit-2026-09-18.md)

## License

MIT — see [`LICENSE`](LICENSE).

## Documentation editions

Start with the [organized handbook](docs/handbook.md) for current usage, design, security and test guidance. Reviewed downloadable editions: [project-guide.docx](docs/reports/project-guide.docx).

[Publication identities and source scope](docs/reports/publications.json) · [Documentation validation record](docs/reports/documentation-refresh-2026-11-09.md). Historical results retain their own tested revision and date.
