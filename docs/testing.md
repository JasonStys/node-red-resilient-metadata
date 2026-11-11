# Testing Strategy

The test pyramid emphasizes deterministic logic, then validates the Node-RED boundary in the official runtime helper.

## Layers

1. **Contract/configuration tests** cover defaults, strictness, URL policy, numeric caps, and safe serialized errors.
2. **Queue tests** cover FIFO order, concurrency, overflow, waiting cancellation, active cancellation, close idempotence, and statistics.
3. **Client tests** cover headers, URL encoding, token omission, retry bounds, every principal error class, deadlines, cancellation, byte limits, JSON/schema/identity checks, and service close.
4. **Runtime integration tests** load both custom nodes with `node-red-node-test-helper`, including protected credentials, success/error wiring, pre-network rejection, authentication classification, and unload cancellation.
5. **Build/package checks** retain compiled runtime/editor/schema presence checks, then pack the final archive and install it into a canonical private temporary consumer outside the repository. Only its installed `node-red.nodes` registrations are loaded. Seven actual HTTP/runtime cases exercise success, credentials/correlation, invalid input without a request, HTTP 401, HTTP 429 followed by success, excessive 503 cooldown refusal, invalid provider data, and actual in-flight socket cancellation on unload. The official helper supplies a real Node-RED node runtime with in-memory fixture storage; this is separate from production editor hosting or deployed flows.
6. **Performance guard** measures 50,000 validations and a 2,000-job bounded queue workload with intentionally broad five-second regression limits.

## Coverage policy

Unit coverage applies to contracts, transport-independent runtime and the native project/history model. Global thresholds remain 90% statements, 90% lines, 85% branches and 85% functions. Adding the native model expands the denominator without reducing a floor. Node-RED registration/child-runtime behavior is evaluated through genuine integration/native tests, not attributed to parent-process coverage.

## Native acceptance

`pnpm native:test` adds fifteen real Node-RED/provider scenarios (no helper runtime or fetch double), retained channel ordering and actual file/profile/resource controls. Cases cover success, 429/503 retry, excessive cooldown, timeout, malformed/auth/not-found, invalid input, overflow, held/pre-input cancel, held close, record/graph redeploy and observer failure. Original helper-based and installed-tarball acceptance remain mandatory.

The real Electron journey uses independently specified authored voltage 460, original `INVALID_INPUT`, three actual requests for two inputs after one 429, ordinary exported-flow structure, retained cancellation and durable history. A native save dialog is held while repeated Quit/Close must retain the visible app, actual export, child and provider. Readiness remains 120 seconds; normal exit 45 seconds. No retry-until-pass or forced-kill success exists. Actual final ZIP relocation and two compiled launches are mandatory, separately from source UI checks.

The installer-component fixtures test real archives/locks and genuine offline CLI pack/install/config/glob behavior with a fresh cache and actual unused registry tripwire. Complete private runtime and desktop-tool graphs audit at moderate severity without suppression; the original pnpm graph remains independent. CodeQL retains the original JS/TS analyze job/category and adds Python/Actions security-extended analyses for new tooling. PR scans and final processed full-main results are separate acceptance evidence.

## CI policy

The full `pnpm verify` gate runs on Node.js 22 and 24 across Linux and Windows for pushes and pull requests. The Linux/Node.js 24 job also packs the installable tarball and uploads it with coverage output. CodeQL runs independently so security scanning remains visible even when a functional job fails. The Linux/Node.js 24 job also audits the complete dependency graph at moderate severity; there are no advisory ignores or development-graph exclusions.

## Reproducing evidence

```bash
pnpm test
pnpm test:integration
pnpm benchmark
pnpm verify
pnpm package:verify
pnpm audit --audit-level=moderate
pnpm pack:artifact
```

Recorded original local results are in [`reports/verification-report.md`](reports/verification-report.md); [native workbench observations](reports/native-workbench-2026-11-11.md) distinguish source, dependency and distribution checks. CI run artifacts are the authoritative evidence for a particular commit.

## Server cooldown regressions

`tests/unit/retry-after.test.ts` uses an injected fixed clock and observed/fake-timer sleeps to test independent expected waits for 429/503, delta seconds, date validation, past dates, minimum spacing, 30-second boundaries, hostile/malformed headers, finite retry budgets and cancellation without a real delay. The official Node-RED runtime helper also exercises a rate-limited lookup recovering on output 1 and a long cooldown reporting on output 2 without an early retry. See `reports/practical-workflows-2026-11-09.md` for observed local evidence.

## Installed consumer isolation

`pnpm package:verify` requires an existing production build, the locked development host tools, and npm registry access (or a populated cache) for the archive's exact Zod dependency. It verifies Zod's version and integrity against `pnpm-lock.yaml`, disables install scripts, uses empty private npm configuration files and a credential-filtered child environment, and checks physical installed paths before requiring product code. It does not replace global `fetch`; actual synthetic HTTP responses reach Node's native transport.

The helper and provider bind their own ephemeral numeric-loopback ports. The held-request fixture has a 60-second product timeout, but must close its actual socket within the independent five-second test deadline when the flow unloads. Fresh flow instances, request counts and no-late-message assertions prevent retry/cancellation success from being inferred from fixture state. Child commands have 120-second deadlines and bounded diagnostics. Only verified owned temporary directories, browsers/listeners are cleaned up; existing services and deployed flows are never adopted. See [current evidence](reports/installed-consumer-2026-11-09.md).
