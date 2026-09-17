# ADR 0001: One bounded client per configuration node

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

Several flow nodes can target the same remote metadata service. Independent queues would multiply concurrency, hide aggregate backpressure, duplicate credentials, and complicate shutdown. A global singleton would make unrelated service configurations interfere with each other.

## Decision

Each `metadata-service` config node owns one `MetadataClient` and one `BoundedWorkQueue`. Runtime lookup nodes reference that config node. The queue uses a bounded array for FIFO waiting jobs plus a set of active abort controllers.

The array has O(1) append/start and O(q) cancellation removal. Because `q` is explicitly capped at 1,000 and is normally tens of entries, this favors simple, reviewable lifecycle code over a custom linked queue. Active and waiting bounds combine to O(c + q) retained jobs.

## Consequences

- Service-wide limits are visible and enforceable.
- Credentials and transport policy have one owner.
- Closing a config node cleanly rejects/aborts all associated work.
- Separate config nodes intentionally have separate capacity budgets.
- A waiting cancellation scans a small bounded array.
- Durable delivery and distributed rate limits remain outside this in-memory node.
