# Native metadata workbench

This Windows x64 app composes the original compiled `metadata-service` and `resilient-metadata` nodes in Node-RED 5.0.8. Its fixed owned HTTP provider makes user-authored messages, records and failure conditions reproducible without hardware, cloud accounts or an independent broker. Prepared records are editable data within the actual application.

## User workflow

1. Start `NodeRedMetadata.exe` from its complete extracted portable directory. Keep its runtime and `resources` beside it. A visible static startup window precedes bounded source verification.
2. Edit the title, policy, JSON payload array and authorized record array. Metadata values retain your meaning and units; they are not automatically calibrated or converted.
3. Save explicitly. Duplicate JSON keys, excessive structure/bytes, unknown fields, ambiguous records and invalid policy/record schemas fail before replacement. Message payloads may deliberately violate the original request contract to exercise its real error route.
4. Deploy and run. Inspect each original output and `done` completion, queue state, request status and attempt count. A completed batch does not mean every item succeeded. The project SHA binds messages/records/scenario; Node-RED's separate revision identifies the actual graph.
5. Change a fault condition, save and rerun. Cancel redeploys the actual flow and waits for original completion and response closure. Cancelled/not-started work remains distinct from success.
6. Select an exact historical run to inspect/export, or review its project in the editor before an explicit save/replay. Project/flow exports use the current saved project. A real exported Node-RED flow has a placeholder service URL and no credentials; configure independent approved integration separately.
7. Exit normally. Repeated Quit/Close retains accepted dialogs, work and the actual provider/child until completion. Failure is reported rather than converted into an exit-zero result.

## Durable data and limits

Default data: `%LOCALAPPDATA%/JasonStysPortfolio/node-red-resilient-metadata/workspace`, outside application resources. `project.json` contains current configuration and exact project/run pairs; `previous.json` supports explicit previous-save review. History is bounded to ten runs and 16 MiB, with visible eviction counts. This is plaintext trusted-OS-owner storage, not authenticated reviewers, multiuser authorization, encryption or a complete audit archive.

Use authorized data and trusted local storage. Pre-existing aliases/hardlinked mutable files, unknown profile content, stale locks and application-root profiles are refused without reset. Imports use bounded descriptor-bound reads; exports create new files exclusively. Admission is static and does not protect against a hostile concurrent same-account writer. Current/previous replacement is not a multi-file atomic transaction or universal crash-recovery guarantee; interrupted locks/nonce files remain for review.

The sandboxed renderer has a closed main-frame bridge, denied permissions/navigation/downloads and a three-resource protocol. JSON is data; no renderer URL is fetched. The real child loads fixed verified modules and a closed generated graph. Project data cannot choose paths, executables, module/node types, credentials or endpoints. Native HTTP is owned-loopback only; user-selected file locations remain subject to OS filesystem/mount behavior.

## Reproduce a package

Use locked tools and official Python 3.14.10 as a build tool only. Python is not shipped or required by end users. Output paths must be fresh.

```powershell
corepack enable
python scripts/prepare-npm-component.py --download --package
pnpm install --frozen-lockfile
npm --prefix native-runtime ci --ignore-scripts --install-links
npm --prefix desktop ci --ignore-scripts
node desktop/node_modules/electron/install.js
pnpm verify
pnpm native:test
python -m unittest discover -s native-installer/tests -p test_prepare.py -v
python -m unittest discover -s tests -p test_native_archive.py -v
python native-installer/tests/offline_cli.py --node desktop/node_modules/electron/dist/electron.exe --output artifacts/native-tooling/npm-cli-check
node scripts/build-native.mjs release/candidate
python scripts/archive_native.py release/candidate/win-unpacked .runtime/native-candidate
```

Hosted builds require exact clean source. Explicit local `--allow-dirty` candidates record that fact. Every resource/dependency and fixed owner is hashed; the npm component's 416 original non-manifest files (CLI, documentation and terms) are independently verified again after installation. Hashes identify bytes; they are not signatures or malicious same-owner attestation.

The ZIP consumer compares every relocated payload and drives the actual compiled app twice: authored data, failures, Keep/Replace decisions, cancellation, export, same-profile restart and held Quit. [Observed local validation](reports/native-workbench-2026-11-11.md) separates completed source checks from the clean compiled/hosted acceptance required for distribution. Default CI uploads bounded receipts/screenshots. A complete unsigned ZIP is retained for one day only after explicit trusted-main request; no workflow publishes a release.

The app bundles Electron 44.11.1 / Node 24.22.2 and disclosed npm 12.2.2+workbench.1, whose actual offline CLI behavior and patched graph are validated separately. See [component provenance](native-npm-component.md). The package is Windows-only and unsigned. No OS installer, signing/notarization, automatic updater, service or installed desktop-shortcut claim is made by this source build.
