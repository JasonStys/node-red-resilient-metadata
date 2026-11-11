# Native npm component: provenance, dependency repair and validation

Author: Jason Stys. Updated: 2026-11-11.

The desktop application runs the genuine Node-RED engine. Its registry module reads npm package metadata during startup even though the application's arbitrary package installation and palette editor are disabled. Removing npm or substituting an installer stub would change that contract. The component instead retains npm's actual upstream CLI, core, README and license, and discloses a narrowly rebuilt dependency manifest.

## Exact upstream and disclosed change

The source is [npm 12.2.2 on the official registry](https://registry.npmjs.org/npm/-/npm-12.2.2.tgz), upstream commit `fd31aa66f0b715bbae1fc072d24fc7e8f23657ad`. The compressed archive contains 3,069,597 bytes. Its SHA-256 is `07fecbf753e2c3bc10ebeb3e9ed8738f6a0cc1292998b79e2e9f1dd2a5525e0c`; the complete official SHA-512 SRI is pinned in `native-installer/upstream.json`. Those hashes identify bytes; they do not constitute a publisher signature.

The component retains **416 original CLI/core/documentation/license files byte for byte**. Its original 417-file inventory includes the upstream package manifest, whose exact original bytes are separately retained. The changed manifest is explicitly versioned **12.2.2+workbench.1**, marked private, and retains original upstream authorship. It updates `glob` to 14.0.2 and `minimatch` to 11.0.5, adds matching dependency overrides, and removes bundled dependency declarations and upstream development-only dependency, workspace and lifecycle metadata. No npm JavaScript implementation is patched. Application-owned setup and tests are by Jason Stys; npm is by its upstream authors.

The original npm license is **Artistic-2.0**, with its original LICENSE and README preserved. Transitive packages retain their own terms in the staged resource tree and application notices. Do not describe this variant as a signed or official npm binary.

## Reproducible boundaries

`scripts/prepare-npm-component.py --download` explicitly fetches the single pinned official archive without redirects. `--archive PATH` admits the same exact bytes from a local file. `--verify` verifies an already prepared source without network access. A pre-existing source is verified rather than replaced. An ordinary, bounded, single-link input is required; archives are streamed and names, types, counts, member sizes and expanded bytes are bounded before writing. No archive-selected path is extracted directly.

The helper cross-checks the full original core inventory, exact metadata transformation and frozen lock. Lock entries must resolve to HTTPS `registry.npmjs.org` URLs with integrity values; linked and bundled entries are refused. Old matching glob/minimatch leaves are rejected even when an altered lock is self-consistently hashed. Prepared core files are verified again; generated `node_modules` is separately installed and audited through its frozen graph.

Preparation is an explicitly invoked build operation in a trusted OS-owner workspace. Static ancestor admission and descriptor checks do not establish a sandbox against a hostile concurrent process running as that same OS user.

The **component's own** `package-lock.json` contains 148 nodes including its root. Its 147 dependencies are installed with lifecycle scripts disabled and engine checks enabled. npm12 reads `package-lock.json`; the earlier `npm-shrinkwrap.json` attempt returned a real ENOLOCK and is retained as a failed attempt. The native runtime has a **separate** frozen lock and direct local npm dependency. Its own installation/audit is necessary; the component lock is not a transitive-lock substitute.

Run commands from the repository with a supported Node runtime and isolated user/global configuration:

```text
python scripts/prepare-npm-component.py --download
python scripts/prepare-npm-component.py --package
node native-installer/source/bin/npm-cli.js ci --ignore-scripts --engine-strict --prefix native-installer/source
node native-installer/source/bin/npm-cli.js audit --omit=dev --json --prefix native-installer/source
python native-installer/tests/test_prepare.py
python native-installer/tests/offline_cli.py --node /absolute/path/to/node --output /absolute/repo/artifacts/native-tooling/fresh-proof
python scripts/prepare-npm-component.py --verify
```

Use a fresh proof directory. The offline harness supplies empty private configuration, fresh cache/home paths and an actual owned loopback registry tripwire. It never reads ordinary npm account configuration or performs a global install. The normal npm installation on this PC was not used as the repaired component; the two observed original system npm files remained unchanged.

## Actual validation, 2026-11-11

| Check                          | Observed result                              | Practical meaning                                                          |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------- |
| Original core admission        | 418 prepared files verified                  | 416 upstream files, disclosed manifest, own lock                           |
| Frozen component installation  | 147 dependencies installed, scripts disabled | Actual upstream npm CLI, no simulated installer                            |
| Actual npm12 advisory audit    | 0 info/low/moderate/high/critical findings   | Point-in-time registry observation                                         |
| Source and archive regressions | 22 passed                                    | Real tar, hardlink, traversal, duplicate, budget and altered-lock refusals |
| Real offline CLI compatibility | 7 passed on Node 24.22.2                     | Actual CLI/package bytes and installed inert module                        |
| Offline registry tripwire      | 0 requests; listener stopped                 | No registry request during the offline cases                               |

The seven CLI cases cover version identity; exact pack selection with nested ignore rules and lifecycle sentinels; real archive production; real offline installation with exact original bytes, dependency listing and executable inert module; ENOTCACHED failure preserving the prior consumer manifest/lock; actual patched nested/brace matching and negative matching; and an unused real network tripwire. Expected pack file names are independently enumerated, rather than copied from the tool's output.

The initial offline fixture used older npm JSON output assumptions and then OS-dependent glob separators. Both failed outputs are retained. Only the harness's current-schema decoding and explicit documented POSIX output option changed; required file selection, refusal and preservation checks remained in place.

See [the machine-readable component report](reports/native-npm-component-2026-11-11.json). Full engine, graphical app, package, downloaded release and installed user journeys have separate reports; this component report does not claim those future stages are complete. The offline fixtures do not certify every npm command, external package installation, lifecycle script, or absence of security defects.

## File responsibilities and declaration index

| File                                      | Purpose                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `scripts/prepare-npm-component.py`        | Bound source/contract admission, exact preparation and verification            |
| `native-installer/upstream.json`          | Upstream URL, SRI, sizes, hashes, original commit and explicit patch           |
| `native-installer/upstream-package.json`  | Exact original upstream manifest bytes                                         |
| `native-installer/upstream-core.json`     | Original 417-file core byte inventory                                          |
| `native-installer/component-package.json` | Disclosed private manifest variant                                             |
| `native-installer/package-lock.json`      | Ordinary frozen component dependency graph                                     |
| `native-installer/tests/test_prepare.py`  | Network-free admission and preservation regressions                            |
| `native-installer/tests/offline_cli.py`   | Real CLI offline compatibility and network-tripwire tests                      |
| `native-installer/source/`                | Generated, ignored original core plus manifest/lock and installed dependencies |

Each application-owned Python file has an introductory purpose, function/class descriptions, and an exact generated declaration index listing module variables, parameters and local bindings by line. Upstream source remains unmodified and keeps its own original comments.

## Original development host and actual installed closures

The same verified component now replaces only `npm@11.21.0` in the original pnpm development host. Node-RED stays 5.0.8; both original helper initialization calls, all source/integration/installed-tarball cases and the public package's Zod dependency remain intact. A scoped glob override also selects 14.0.2. Prepare the generated component before a frozen pnpm install, including on a cold checkout. This is a development dependency repair, not a new dependency in the public node package.

Independent physical inspection found an affected glob 13.0.7 and stale bundled minimatch 10.2.5 after an in-place dependency update. The old tree was preserved and a fresh frozen install removed that residue. The actual original-host 595 package roots and native 413 dependency roots now resolve glob 14.0.2/minimatch 11.0.5 with no opaque bundle declarations; 416 original non-manifest core files and the disclosed variant manifest are checked separately. These counts describe installed resolution roots, not unused cache/store copies or a universal proof about arbitrary vendor code. Full locked advisory audits remain separate required gates.

The genuine offline CLI fixtures also run from each **actually installed** development/native npm context, under the shipped Node 24.22.2. That verifies the resolved dependency closure rather than assuming that the prepared component's own 148-node lock controls a parent's transitive dependencies. `--component source|development|native` chooses only fixed repository tooling locations. Every mode uses fresh synthetic package/config/cache data and a real unused loopback registry tripwire; no global install or normal account configuration is involved. Declaration locations are maintained in [the generated code map](code-map.md); unchanged helper files also retain their inline indexes.

## Deterministic component TAR and package-manager imports

`--package` is a separate, explicit network-free build operation after preparation.
It rechecks all 418 ordinary single-link inputs, and emits
`native-installer/npm-12.2.2-workbench.1.tar`. This generated file is ignored by Git.
The uncompressed USTAR has sorted `package/` paths, original upstream file modes
(ten executable files), fixed zero IDs/time, empty owner names, and no dependencies.
Its exact 3,717,120 bytes, SHA-256 and SHA-512 SRI are pinned in `upstream.json`.
Both parent locks must bind that same TAR; the component's own frozen lock remains
a separate validation input. Cold checkouts prepare then package before installation.

Directory imports were tested and caused the development package manager to hardlink
prepared core files even with its copy import preference. Those failed candidate
trees were preserved. The single-link admission rule remains in place; a real local
TAR import avoids relying on mutable directory-import behavior. Actual inert package
controls confirmed that both package managers consume plain TAR and record its SRI.
Full resolved parent-graph checks are recorded separately after each install.

The serializer bounds names and bytes before allocation. An existing output is
verified rather than replaced; conflicting bytes or a linked output are refused and
preserved. `--verify` stays read-only, verifies an existing TAR when present, and
does not create one. All 22 regressions passed, including real NTFS hardlinks,
order-independent bytes, every TAR member and executable mode, required dual
digests, changed source/manifest/lock rejection, and no-clobber output checks.
An independent comparison read all 417 official core modes and all 418 generated
TAR bodies. These checks do not claim publisher signing, arbitrary lifecycle safety,
or completed desktop acceptance.
