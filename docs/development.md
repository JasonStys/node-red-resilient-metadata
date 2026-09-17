# Development Guide

## Prerequisites

- Node.js 22 or newer.
- Corepack with pnpm 11.19.0.
- Git.

The workspace selects pnpm's hoisted linker because the official `node-red-node-test-helper` resolves Node-RED runtime internals using an npm-style dependency layout.

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

Do not commit `dist`, coverage HTML, tarballs, tokens, `.env` files, or exported Node-RED credentials.

## Change workflow

1. Update the Zod contract and portable JSON Schema together for contract changes.
2. Add the smallest deterministic unit test that proves new policy.
3. Add a Node-RED integration case when message routing, credentials, status, or lifecycle changes.
4. Update editor help, README, code map, and operations notes for user-visible behavior.
5. Run `pnpm verify` and inspect the tarball from `pnpm pack:artifact`.
6. Confirm the package contains runtime/editor pairs and no secret/example credential export.

## Coding rules

- Keep strict TypeScript and exact optional properties enabled.
- Validate at trust boundaries; keep internal functions typed and small.
- Bound time, bytes, retries, concurrency, queue length, and externally supplied strings.
- Use stable error codes; never expose raw response bodies or authorization data.
- Clean up timers and event listeners along success, failure, cancellation, and close paths.
- Prefer names that explain policy over comments that merely restate syntax.
- Document algorithmic complexity where a data-structure choice affects operations.

## Primary references

- [Node-RED: Creating Nodes](https://nodered.org/docs/creating-nodes/)
- [Node-RED: Configuration Nodes](https://nodered.org/docs/creating-nodes/config-nodes)
- [Node-RED: Node Credentials](https://nodered.org/docs/creating-nodes/credentials)
- [Node-RED: Node Status](https://nodered.org/docs/creating-nodes/status)
- [Node-RED: Node HTML](https://nodered.org/docs/creating-nodes/node-html)
- [Official Node-RED test helper](https://github.com/node-red/node-red-node-test-helper)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [OWASP: Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
