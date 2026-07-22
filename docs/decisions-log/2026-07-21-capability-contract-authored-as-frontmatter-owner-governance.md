---
date: 2026-07-21
title: "the capability contract is authored as SKILL.md frontmatter; owner is the first governance gate"
---

## 2026-07-21: the capability contract is authored as SKILL.md frontmatter; owner is the first governance gate

Phase A of the public multi-runtime harness OS (spec
`docs/specs/2026-07-21-void-harness-public-multiruntime-os.md`) needs a structured **capability
contract** per skill: identity, declared runtimes, per-runtime enforcement tier, owner, eval targets.
The contract is authored **as SKILL.md frontmatter fields**, extending the existing
`description`/`activation`/`triggers` block, rather than as a sibling `capability.yaml` per skill.

The credible alternative was a dedicated `capability.yaml` next to each `SKILL.md`. Rejected: the
graph kernel already parses frontmatter (`packages/harness-graph/src/derive/read-frontmatter.ts`) and
threads it onto `GraphNode`; a second file would add discovery, a second parser, and a drift surface
for zero gain. Frontmatter keeps one source of truth per capability and reuses the proven
`parseActivation`/`parseTriggers` seam.

The first field shipped is `owner:` (accountable maintainer), and it is **governance, fail-closed**: a
new `missing-owner` detector (`analyze/missing-owner.ts`, wired into `DETECTORS`) emits a blocking
`error` for any skill node without an owner, so `graph check` and the CI "Graph integrity" gate fail.
The rule is scoped to skills — hooks/commands/packs/agents are not capabilities. All 64 skills were
backfilled `owner: folpe` (single maintainer today; per-domain granularity deferred until a second
owner exists).

Why: the five-state capability model (`available → installed → verified → used → effective`) is only
honest if every capability has an accountable owner and a proof status. Making ownership a fail-closed
gate from the first field means no capability can ever ship ownerless, and the same frontmatter seam
carries `runtimes`, `enforcement`, `evals.targets`, and `success_signal` in the following Phase A
steps without new machinery.
