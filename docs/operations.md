# Operations Guide

## Configuration

| Setting      | Range                   | Operational effect                                         |
| ------------ | ----------------------- | ---------------------------------------------------------- |
| Base URL     | HTTPS, or loopback HTTP | Service root; no userinfo, query, or fragment.             |
| API token    | optional                | Sent as a bearer token and stored in Node-RED credentials. |
| Timeout      | 100–60,000 ms           | Deadline per attempt, not for the entire queue wait.       |
| Max response | 1 KiB–1 MiB             | Maximum declared or streamed response body.                |
| Retries      | 0–2                     | Additional attempts for eligible idempotent GET failures.  |
| Retry delay  | 0–5,000 ms              | Abortable fixed delay between attempts.                    |
| Concurrency  | 1–32                    | Shared active requests per config node.                    |
| Queue depth  | 0–1,000                 | Shared waiting requests before `QUEUE_FULL`.               |

Start with low concurrency and no more than one retry. Increase them only from measured service capacity and latency, because retries consume the same shared capacity as first attempts.

## Status states

- **green dot / ready** — configured and idle.
- **blue dot / requesting** — the runtime node has active work.
- **green dot / success** — most recent message completed successfully.
- **yellow ring / error text** — retriable operational failure.
- **red ring / error text** — non-retriable input, configuration, authentication, or contract failure.

Status is a local hint, not an audit trail. Persist `metadataLookup` or `metadataError` to an approved telemetry destination when history is required.

## Failure handling

- Route output 2 to a metrics/logging flow that redacts the surrounding message if it may carry private application data.
- Alert on sustained `AUTHENTICATION_FAILED`, `CONFIGURATION_ERROR`, or `INVALID_RESPONSE` rather than retrying them.
- Treat `QUEUE_FULL` as backpressure. Reduce input rate or increase capacity only after confirming upstream service headroom.
- Treat timeouts and 5xx responses as transient only within the configured retry cap; use a delay/dead-letter flow for broader recovery.
- A redeploy intentionally cancels work. Senders that require at-least-once behavior must implement durable replay outside this node.

## Local demonstration

1. Run `node examples/mock-service/server.mjs` with `METADATA_DEMO_TOKEN=demo-token`.
2. Import `examples/flows/reliability-demo.json`.
3. Open the service config node and enter `demo-token` in the credential field.
4. Deploy, then trigger each inject node and inspect both debug outputs.
5. Optionally configure/start the MQTT broker node to forward validated records.

The mock modes are synthetic and deterministic: `retry-demo`, `timeout-demo`, `malformed-demo`, and `missing-demo`.

## Upgrade and rollback

Before upgrading, export the flow without credentials, save the installed tarball, and run the example flow in a non-production instance. To roll back, stop Node-RED, install the previous tarball in the user directory, then restart. Credentials remain associated with the config node ID unless the config node is replaced.
