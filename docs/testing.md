# Testing Strategy

The test pyramid emphasizes deterministic logic, then validates the Node-RED boundary in the official runtime helper.

## Layers

1. **Contract/configuration tests** cover defaults, strictness, URL policy, numeric caps, and safe serialized errors.
2. **Queue tests** cover FIFO order, concurrency, overflow, waiting cancellation, active cancellation, close idempotence, and statistics.
3. **Client tests** cover headers, URL encoding, token omission, retry bounds, every principal error class, deadlines, cancellation, byte limits, JSON/schema/identity checks, and service close.
4. **Runtime integration tests** load both custom nodes with `node-red-node-test-helper`, including protected credentials, success/error wiring, pre-network rejection, authentication classification, and unload cancellation.
5. **Build/package checks** verify that runtime JavaScript, declarations, maps, editor HTML, and JSON Schemas are present.
6. **Performance guard** measures 50,000 validations and a 2,000-job bounded queue workload with intentionally broad five-second regression limits.

## Coverage policy

Unit coverage applies to contracts and transport-independent runtime code. Global thresholds are 90% statements, 90% lines, 85% branches, and 85% functions. Node-RED registration code is evaluated through real-runtime integration tests instead of misleading line-only coverage.

## CI policy

The full `pnpm verify` gate runs on Node.js 22 and 24 across Linux and Windows for pushes and pull requests. The Linux/Node.js 24 job also packs the installable tarball and uploads it with coverage output. CodeQL runs independently so security scanning remains visible even when a functional job fails.

## Reproducing evidence

```bash
pnpm test
pnpm test:integration
pnpm benchmark
pnpm verify
pnpm pack:artifact
```

Recorded local results are in [`reports/verification-report.md`](reports/verification-report.md). CI run artifacts are the authoritative evidence for a particular commit.
