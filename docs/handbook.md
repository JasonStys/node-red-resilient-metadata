# Node-RED Resilient Metadata handbook

By Jason Stys.

Install bounded, credential-aware Node-RED metadata nodes. Final TGZ tests now use a real separate Node-RED runtime and HTTP provider to verify success, routing, retry, cooldown and cancellation; compatible tooling fixes and full-graph auditing address the exposed dependency findings.

Tests the distributed package at its actual message and network boundary and closes the security gap left by a partial dependency audit.

## Read the documentation

| Edition                                          | Audience and contents                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [project-guide.docx](reports/project-guide.docx) | User and developer guide: purpose, current usage, design, boundaries and source references. |

The editable Markdown remains the maintenance source. The Word files are readable editions, and the workbook is an evidence index rather than a test runner. See [publication identities and review](reports/publications.json) and the [documentation refresh record](reports/documentation-refresh-2026-11-09.md).

## Current usage and help

The new [native application guide](native-application.md) covers the genuine editable Node-RED workbench, saved project/run history, independent flow exports and actual child/provider lifecycle. Existing Word publication identities above describe their recorded historical source baseline; they have not been silently regenerated to claim native-release acceptance. Published 1.1.0 acceptance is now recorded in the [current illustrated guide](reports/windows-application-guide-1.1.0.docx), [paired public manifest](reports/windows-application-guide-1.1.0.json) and [full installed observations](reports/installed-windows-1.1.0-2026-11-12.md). The ten-group consumer, separate illustration capture and icon target readback remain distinct scopes.

[README quick start](../README.md) is the entry point. Use the project-specific guides below before changing inputs, operating modes or deployment assumptions.

### Usage and operations

- [operations](operations.md)

### Design and contracts

- [architecture](architecture.md)
- [message contract](message-contract.md)

### Security and validation

- [security](security.md)
- [testing](testing.md)

## Historical results and reproduction

The reviewed source is [`db08d20afb9088310b76d090c5c12e8964f4676d`](https://github.com/JasonStys/node-red-resilient-metadata/tree/db08d20afb9088310b76d090c5c12e8964f4676d). The observed functional workflow baseline is `db08d20afb9088310b76d090c5c12e8964f4676d`; those observations are recorded at `2026-11-10T05:25:40.628667+00:00`. They do not certify an unrun later revision.

- [Detailed recorded validation](reports/installed-consumer-2026-11-09.md)
- [Current Actions](https://github.com/JasonStys/node-red-resilient-metadata/actions) records later integration checks separately.
- Preserve dated measurements and follow the existing testing guide to reproduce them; a test-source inventory alone does not establish execution.

## Practical boundaries

- Synthetic local providers and in-memory fixture storage exercise the installed node lifecycle, not a production editor deployment, external provider availability or persistent flow configuration.
- Independent use of the original node package still requires a separately configured Node-RED host. The published portable workbench bundles its own fixed local host/provider; it is not an OS installer or an arbitrary Node-RED editor. No new public npm publication is claimed.
- Known-advisory audit results are time-specific and do not prove absence of vulnerabilities; checksum evidence does not establish publisher authentication.

## Maintaining these editions

Update the editable usage/design/test documents first. Rebuild and visually review every Word page and workbook tab before replacing an edition; verify the exact binary digests and evidence source in publications.json. Keep account data, logs with secrets, installed-app state and private test stores out of documentation. Source and release assets retain their existing security and licensing boundaries.
