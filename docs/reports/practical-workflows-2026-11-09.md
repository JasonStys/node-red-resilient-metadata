# Provider cooldown workflow verification — 2026-11-09

The lookup client now respects valid `Retry-After` values on HTTP 429 and 503. It waits for the longer of configured spacing and server cooldown, with caller/redeploy cancellation throughout. A cooldown above 30 seconds produces a safe error for later operator recovery instead of retrying early. Error response bodies are released rather than retained. Other status and retry-count policies remain intact.

## Observed local results

`pnpm verify` passed on Windows on 2026-11-09:

- Formatting, ESLint and strict TypeScript checks passed.
- 54 unit tests passed, including fixed-clock delta/date, malformed/oversized headers, 30-second limit, finite attempts and cancellation regressions.
- Coverage: 97.03% statements, 92.81% branches, 95.34% functions and 97.40% lines.
- Six official Node-RED runtime integration tests passed, including rate-limit recovery through output 1 and excessive provider cooldown through output 2.
- Build and package verification passed (six required distribution files).
- The existing 50,000-validation and 2,000-job queue performance guards passed (27.051 ms and 4.682 ms respectively in this run; timings are host/load dependent).

No paid service, production credentials or real provider requests were used. Dependencies were installed from the unchanged frozen lockfile with lifecycle scripts disabled. No GitHub Actions were triggered by this local verification. Coordinated CI remains required for the final integration commit and supported platform matrix.

## Operator journey

A lookup may receive a 429 with a two-second cooldown, wait without blocking cancellation, then deliver the validated record with `attempts: 2`. If a provider instead requests 120 seconds, output 2 identifies the 30-second local wait policy; the flow can schedule a later authorized retry. A redeploy aborts a pending server cooldown and releases shared capacity without issuing the next GET.
