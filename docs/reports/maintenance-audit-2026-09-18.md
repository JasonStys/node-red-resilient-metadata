# Maintenance audit — 2026-09-18

## Result

The validated source baseline was `2d038fd`. Hosted [CI](https://github.com/JasonStys/node-red-resilient-metadata/actions/runs/35181889158) and [CodeQL](https://github.com/JasonStys/node-red-resilient-metadata/actions/runs/35181889145) both passed.

## Dependency decisions

- Node 26 type declarations were rejected because CI validates Node 22 and 24; newer declarations could allow APIs absent from those runtimes.
- Dependabot now holds Node-type and TypeScript major changes for a deliberate runtime/toolchain migration.
- The existing Linux and Windows verification matrix remains the compatibility authority.
- No open pull request or non-default maintenance branch remained when this report was prepared.

Historical pull-request failures remain as immutable evidence and do not describe the current default branch.
