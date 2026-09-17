# Architecture

## System boundary

```text
Node-RED message
      |
      v
resilient-metadata -- validates input and owns per-node abort controllers
      |
      v
metadata-service -- owns credential, policy, and one shared client
      |
      v
BoundedWorkQueue -- max active + max waiting; FIFO; cancellation
      |
      v
MetadataClient -- timeout -> GET -> byte cap -> JSON/schema/identity checks
      |
      +---- success: validated record + lookup evidence
      |
      +---- failure: stable, credential-free structured error
```

The runtime node and config node have separate responsibilities. Many lookup nodes may reference one config node, so concurrency and queue limits apply to the external service as a whole rather than independently per canvas node.

## Request sequence

1. Read the configured message property without mutation.
2. Validate and normalize the strict request schema.
3. Reject immediately if the service is invalid, closing, or at queue capacity.
4. Schedule work through the shared FIFO queue.
5. Create an attempt-scoped timeout and forward caller cancellation.
6. Send an encoded GET with a correlation header and optional bearer credential.
7. Bound the response before and while streaming it into memory.
8. Parse JSON, validate the response contract, then compare product/version identity.
9. Retry only a capped subset of safe failures.
10. Route a single message to either success or structured-error output and call `done` once.

## Complexity and bounds

| Operation             | Time           | Space      | Bound                                              |
| --------------------- | -------------- | ---------- | -------------------------------------------------- |
| Queue submit/start    | O(1) amortized | O(q + c)   | `q <= maxQueueDepth`, `c <= maxConcurrent`         |
| Pending cancellation  | O(q)           | O(1) extra | Queue maximum is configurable and capped at 1,000. |
| Request validation    | O(n)           | O(n)       | Identifier and payload field lengths are capped.   |
| Response accumulation | O(b)           | O(b)       | `b <= maxResponseBytes`, capped at 1 MiB.          |
| Retry                 | O(r × request) | O(1) extra | `r <= 2`; only the idempotent GET is retried.      |

An array is intentional for the small bounded FIFO queue: it keeps the implementation auditable, while the configured cap prevents O(q) removal from becoming unbounded. This trade-off is recorded in the decision log.

## Lifecycle ownership

- The config node owns the client and shared queue. Closing it rejects waiting jobs and aborts active jobs.
- Each runtime node tracks its own request controllers. Closing or redeploying the node aborts its active calls and suppresses late sends.
- Attempt timers and external abort listeners are removed in `finally` or on completion.
- The local simulator clears its delayed response when the caller disconnects and closes on `SIGINT`/`SIGTERM`.

## Extension points

New service fields belong in both the Zod contract and portable JSON Schema, followed by contract tests. New error types require a stable code, editor/help documentation, and routing tests. Transport changes should stay behind `FetchLike` so core tests remain deterministic.
