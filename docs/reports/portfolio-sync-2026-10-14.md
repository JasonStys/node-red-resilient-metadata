# Portfolio synchronization — 2026-10-14

Created by Jason Stys.

This candidate combines the reviewed proposals below while preserving their
commit ancestry and the existing main-branch security fixes. Conflicting
version declarations are combined explicitly; affected locks are regenerated
from the reviewed manifests. No audit or coverage budget is lowered.

- [Original proposal #3](https://github.com/JasonStys/node-red-resilient-metadata/pull/3).
- [Original proposal #4](https://github.com/JasonStys/node-red-resilient-metadata/pull/4).
- [Original proposal #5](https://github.com/JasonStys/node-red-resilient-metadata/pull/5).
- [Original proposal #6](https://github.com/JasonStys/node-red-resilient-metadata/pull/6).
- [Original proposal #7](https://github.com/JasonStys/node-red-resilient-metadata/pull/7).

Coordinated CodeQL steps use the same reviewed immutable release where present.
Source and generated-symbol contracts remain enforced by the existing workflows.
The initial candidate failed frozen installation because an overlapping lock lacked
`ignore@7.0.9`. The repaired lock is regenerated from the reviewed direct versions;
no installation or quality gate is skipped. CI and CodeQL actions are coordinated
and pinned to immutable reviewed releases. Fresh native CI is required for this head.
The complete candidate must pass its applicable native CI before promotion.
[Inspect candidate checks](https://github.com/JasonStys/node-red-resilient-metadata/actions?query=branch%3Amaintenance%2Fportfolio-sync-20261014).

This maintenance does not add production deployments, user-data access, automatic
source promotion or new guarantees of security. Existing release tags and assets
are retained. Platform and model-quality limitations remain in the project README.
