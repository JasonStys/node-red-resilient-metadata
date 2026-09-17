# Verification Report

## Scope

This report records the clean local verification of version 1.0.0. GitHub Actions run the same commands on Linux and Windows and retain the tarball/coverage as commit-specific evidence.

## Automated checks

| Check                | Command                           | Result                         |
| -------------------- | --------------------------------- | ------------------------------ |
| Formatting           | `pnpm format:check`               | Pass                           |
| Type-aware lint      | `pnpm lint`                       | Pass                           |
| Strict type check    | `pnpm typecheck`                  | Pass                           |
| Unit/coverage        | `pnpm test`                       | 33 tests passed                |
| Node-RED integration | `pnpm test:integration`           | 4 tests passed                 |
| Production build     | `pnpm build`                      | Pass                           |
| Performance guard    | `pnpm benchmark`                  | Pass                           |
| Package contents     | `node scripts/verify-package.mjs` | Pass; 6 required entries found |
| Installable tarball  | `pnpm pack:artifact`              | Pass                           |
| Clean install smoke  | `npm install artifacts/*.tgz`     | Pass; both entry points loaded |

## Coverage baseline

The final unit run covered 93.33% of statements, 89.92% of branches, 87.80% of functions, and 93.20% of lines across contracts and runtime code. All configured thresholds passed.

## Performance baseline

On the local validation host, 50,000 request validations completed in 30.137 ms (1,659,096 operations/second), and 2,000 queued jobs drained in 7.217 ms. The queue high-water mark was 1,992 with eight active slots, exactly matching the fixed workload shape. These values are a baseline, not a cross-machine service-level objective; CI enforces only the broad five-second regression guard.

## Behavior validated

- Strict request/configuration/response validation.
- Credential header present when configured and absent otherwise.
- Non-retriable auth, not-found, validation, schema, identity, and size failures.
- Bounded retry for network, timeout, throttling, and server failures.
- FIFO scheduling, queue overflow, pending cancellation, active cancellation, and idempotent close.
- Real Node-RED success/error output wiring and flow-unload cancellation.
- Required compiled JavaScript/editor/JSON Schema package entries.

## Manual review

- No real credential, private endpoint, or generated dependency/build output is tracked.
- Exported example flow contains no credential material.
- Repository text is product-neutral and describes only the synthetic integration.
- Documentation covers architecture, Big-O trade-offs, operations, security, contracts, files, and evidence.
