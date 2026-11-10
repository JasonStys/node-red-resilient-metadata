# Documentation refresh â€” 2026-11-09

By Jason Stys.

This documentation-only edition describes source `db08d20afb9088310b76d090c5c12e8964f4676d`. It does not change application behavior, accounts, private data, installers or published releases.

## Published editions and completed review

| File                                     | Bytes | SHA-256                                                            | Reviewed scope                    |
| ---------------------------------------- | ----: | ------------------------------------------------------------------ | --------------------------------- |
| [project-guide.docx](project-guide.docx) | 47261 | `4ef2613ecda886384eedc503140cc202a143b16480045d0538bb1207eec64400` | 8 pages, each viewed individually |

Word review checked plain black titles, readable pagination, whole table rows, source references, practical limits and absence of clipping or overflow. Render receipts were matched to the current DOCX digest before approval. Workbook review inspected both tab previews and actual exported Table/autoFilter elements; recalculated success/failure summaries were compared independently with workflow metadata. Static previews do not draw Excel dropdown arrows; the exported workbook contains the actual filters.

## Evidence and change boundary

- Functional baseline: `db08d20afb9088310b76d090c5c12e8964f4676d`.
- Workflow observation: `2026-11-10T05:25:40.628667+00:00`; exact run URLs and source identities remain in [publications.json](publications.json).
- Local document-package validation verifies exact copied bytes, Office ZIP integrity, approved page/tab identities and internal documentation links. Repository-specific documentation and source-policy commands are run separately and recorded in the integration handoff.
- Source/index metadata is regenerated using the repositoryâ€™s existing tools. Existing privacy, security, coverage and workflow gates are retained.
- PR and later main workflows must pass independently. This record does not claim future or unrun integration CI success.

## Interpretation

The Word files document the cited source; dated source reports retain their original execution scope. A passing workflow is distinct from completed analysis with zero findings, and neither establishes production suitability. The Excel source inventory is not a per-test execution report. Checksums identify exact bytes, not a signature or publisher attestation.

Use the [handbook](../handbook.md) to choose usage, design, security and test documentation. Keep editable Markdown and reviewed editions together; do not replace historical measurements with undated claims.

## Integration-local validation

Observed at 2026-11-10T08:14:10.454393+00:00. Exact Office bytes, package integrity, current rendered-page approvals, source/workflow identities and handbook links passed independent validation. The following repository-specific checks passed; later PR and main workflows remain separate requirements.

- `node <repo>\node_modules\prettier\bin\prettier.cjs --write README.md docs/handbook.md docs/reports/publications.json docs/reports/documentation-refresh-2026-11-09.md` â€” exit 0.
- `node <repo>\node_modules\prettier\bin\prettier.cjs --check README.md docs/handbook.md docs/reports/publications.json docs/reports/documentation-refresh-2026-11-09.md` â€” exit 0.
- `C:\Users\jason\AppData\Local\Programs\Python\Python314\python.exe C:\Users\jason\Documents\Codex\2026-09-16\i\work\codeql-docs-20261109\validate_root_publications.py node-red-resilient-metadata` â€” exit 0.

## Hosted formatting follow-up

The first documentation PR failed the unchanged Prettier gate on the edited historical installed-consumer report. Formatting that report fixed the source integration issue. At 2026-11-10T08:23:04.148206+00:00, the complete original pnpm verify passed locally: 54 unit tests, six source integration tests, seven actual installed-package HTTP cases, all coverage floors, build, lint and types. Benchmark observations were 50,000 validations in 25.718 ms and 2,000 jobs in 5.551 ms; these are local measurements, not hosted acceptance. Fresh four-lane hosted checks remain required.
