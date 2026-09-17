# Contributing

Use Node.js 22 and the pnpm version declared in `package.json`. Create focused changes, add regression tests, and run `pnpm verify` before opening a pull request.

Contract changes must update the TypeScript schema, portable JSON Schema, editor help, and compatibility notes together. Lifecycle changes require a real Node-RED integration test. Never commit credentials, private service data, generated output, or an exported flow containing credentials.

Commit messages should state the behavior changed. Pull requests should describe risk, validation evidence, and any operational/configuration impact.
