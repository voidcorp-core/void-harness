---
date: 2026-07-22
title: "a documented peerDependency of composition between packs is allowed; a bundled runtime dep is not"
---

## 2026-07-22: a documented peerDependency of composition between packs is allowed; a bundled runtime dep is not

`docs/ARCHITECTURE.md` said "two packs may not depend on each other", but
`pack-nextjs` declares `peerDependencies: { @voidcorp/pack-monorepo: workspace:^ }`
— it imports `Result`/`ok`/`err` from `@voidcorp/pack-monorepo/result` in
`withWebhookSafety.ts`. Doctrine and code contradicted (flagged by the external
audit, 2026-07-22).

The credible alternative was the audit's recommendation: **extract the shared
primitives (`result`, `option`, `pipe`) into a new package** that both packs
depend on, making the packs truly independent. Rejected as premature: the entire
shared surface is three pure functional primitives, and `pack-nextjs`'s only use
is `Result`/`ok`/`err` in one file. Creating, versioning, and publishing a new
package to remove one small, intentional edge is exactly the extraction
`package-extraction` warns against — more moving parts than the coupling it
removes.

Resolution: **amend the rule** rather than the code. The ban now targets what it
was really meant to prevent — a **bundled runtime `dependencies` edge** (a hidden
graph that couples release cycles). An **explicit `peerDependency` of
composition** is allowed when: it is declared in `package.json`
`peerDependencies`, documented in the pack README, the shared surface is small,
and `init` co-installs both packs. `pack-nextjs → pack-monorepo` is the
sanctioned example. If the shared surface ever grows substantial, revisit the
extraction (the rule still sends shared *logic* to `core/`).
