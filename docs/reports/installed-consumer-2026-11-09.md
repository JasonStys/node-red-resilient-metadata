# Installed Node-RED package acceptance — 2026-11-09

Jason Stys: final-archive consumer boundary and observed local validation.

The original package check established six required compiled/editor/schema entries. Source integration tests loaded the source/build separately and supplied fake transport. The new acceptance keeps those gates and separately packs the built product, installs the archive in a private external consumer, checks the physical installed paths and reviewed Zod4.6.7 integrity, and loads only the installed manifest's two registrations into the locked official Node-RED5.0.8 helper. Its storage is an in-memory fixture; its node runtime and HTTP transport are genuine.

## Actual consumer cases

1. Valid synthetic metadata reaches output1 over actual HTTP with the configured credential and correlation; the token is absent from output.
2. Invalid input reaches output2 before any provider request.
3. HTTP401 is classified as authentication failure with one request.
4. A real HTTP429 with bounded Retry-After recovers on the second request with attempts2.
5. A real HTTP503/120-second cooldown is declined, never retried early.
6. A malformed provider record reaches the response-contract error route.
7. Unloading a flow aborts a real held HTTP socket within an independent five-second deadline, before the configured 60-second product timeout, and emits no late message.

The consumer uses no global fetch replacement or source aliases. Both listeners are owned ephemeral numeric-loopback servers. Package commands use existing identified JS manager entrypoints, disabled install scripts, empty private npm configuration and a credential-filtered environment; bounded child processes and canonical temporary-root cleanup leave deployed flows and existing servers alone. The output records the actual archive SHA-256. This is checksum evidence, not a signed-publisher claim.

## Dependency findings and correction

The previous full graph reported17 known findings (4high,10moderate,3low) in the development host/tools. Compatible Vitest/coverage5.0.5 and scoped patched leaves preserve Node-RED5.0.8 and product Zod4.6.7. The strict complete moderate audit is now a required Linux/Node24 CI step, with no ignored advisories or omitted development dependencies.

| Package path           | Previous → accepted | Primary advisory                                                                                                             |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Vitest/mocker          | 5.0.1 → 5.0.5       | [upstream mock registration](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8)                   |
| Vite test host         | 8.3.0 → 8.3.4       | [upstream file-boundary correction](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22)                  |
| body-parser1           | 1.20.8 → 1.20.9     | [upstream decompression handling](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828)          |
| multer2                | 2.4.0 → 2.5.0       | [upstream teardown handling](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m)                    |
| fast-uri3              | 3.1.8 → 3.1.9       | [upstream scheme validation](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg)                    |
| qs6                    | 6.16.0 → 6.16.1     | [upstream coercion handling](https://github.com/ljharb/qs/security/advisories/GHSA-6pq8-jhm2-2vcw)                           |
| follow-redirects1      | 1.16.1 → 1.16.2     | [upstream header preservation](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-mrwp-f3q8-3g9p) |
| minimatch affected7–10 | 10.2.6 → 11.0.5     | [upstream amplification correction](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)             |

The minimatch advisory's maintained fix is11.0.1 or newer; the override is limited to the affected range. Native lint/build/tests must demonstrate consumer compatibility instead of treating an audit-only graph change as sufficient.

## Observed local validation

Windows with Node24.18.1 and pnpm11.25.0: `pnpm install --frozen-lockfile`, the complete `pnpm verify`, and full `pnpm audit --audit-level=moderate` passed. The declared CI manager remains pnpm11.19.0; no global manager configuration was changed.

| Gate                                         | Observed result                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Formatting/type-aware lint/strict TypeScript | Pass without relaxed rules                                                                          |
| Existing unit suite                          | 54passed, no skips                                                                                  |
| Core coverage                                | 97.03% statements;92.81% branches;95.34% functions;97.40% lines, original floors retained           |
| Existing source runtime helper suite         | 6passed, no skips                                                                                   |
| Production JS/declarations/editor build      | Pass                                                                                                |
| Actual final-TGZ consumer                    | Seven cases passed in genuine Node-RED5.0.8 with native HTTP, no source imports/fetch replacements  |
| Performance guard                            | 50,000validations30.559ms;2,000jobs6.468ms,1992queued high-water mark; unchanged five-second bounds |
| Full dependency audit                        | 0known vulnerabilities, with no exclusions/ignores                                                  |

The accepted post-documentation consumer archive was SHA-256 `b60340e62a6a8598c3e3e9a26f133dd82cbf5b3dc5b8363f6766698f5c6c7c24`. The repository's local archive/CI run artifacts are disposable evidence, not a new public npm release. Linux and Node22 behavior require the unchanged four-job hosted matrix to accept the final source; this local report does not substitute for those jobs.

## Limits

Only synthetic data and local fixtures are used. This proves the installed nodes' declared HTTP/message lifecycle, not third-party provider availability, a production Node-RED editor configuration, persistent flow storage, exhaustive timing schedules or a native desktop installer. The host runtime remains the installer's responsibility. Existing historical reports retain their original source/test context. Hosted CI and publication require independent acceptance on the final commit.
