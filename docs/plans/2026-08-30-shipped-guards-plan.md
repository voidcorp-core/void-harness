---
title: Close the guards that are shipped and open
date: 2026-08-30
status: in-progress
spec: docs/specs/2026-08-30-shipped-guards-that-are-open.md
author: Folpe + Claude
high_risk: false
---

# Plan — close the guards that are shipped and open

## Goal

Four delivered defects, each a guard that lets through what it exists to refuse. This is also the
first attended dogfood of `void-autopilot` against a real pool, and what it reveals about the
drainer counts as much as what it fixes.

## Units

| key | unit | ticket | footprint | gate |
|---|---|---|---|---|
| 1 | A human gate survives its own spelling | DEV-677 | `autopilot/union-review.ts` | **human** |
| 2 | Three classes of diff stop being granted | DEV-673 | `autopilot/union-review.ts`, `autopilot/chain.ts` | **human** |
| 3 | A failed install leaves no rule that lies | DEV-665 | `commands/init.ts` | — |
| 4 | An unreadable settings file is not replaced | DEV-664 | `lib/settings.ts` | — |

Units 1 and 2 collide on `union-review.ts` and are declared sequential in
`.void/program.md`, not left to footprint inference. Units 3 and 4 are disjoint from the pair and
from each other, so the router should fan them out. **That mixed shape is the point of the
dogfood**: parallel where footprints are disjoint, sequential where they collide, is the routing
claim the skill makes and that nothing has yet observed on real work.

TDD mode is strict on all four: every one is a trust boundary or a data-loss path.

## Verification gate, per unit

Each unit proves its fix on a fixture **proven grantable** by a control assertion. Without that
control, a refusal for an unrelated reason reads as the guard working -- the trap the panel named
on 2026-08-30, and the reason the previous ticket in this area shipped with three acceptance
criteria that were already met.

`pnpm verify` green on the integration SHA, not on any single worker branch.

## Human gates

Units 1 and 2 both rewrite `judgeMergeGrant`. A run must not merge itself through a guard it has
just rewritten, and no refusal the grant can return addresses that circularity. So a person does.

## What this plan is watching, beyond the fixes

- Does the router actually sequence the collision, or does it fan out and conflict?
- Does the review budget shrink the cluster from structural doubt, as declared?
- Does the reconciler integrate four workers into one PR with a journal a person can read?
- What does the union read say about a diff four agents wrote?

Anything the run reveals is a finding like any other, and goes through the admission rule.

## Resume point

**Next**: launch the attended `void-autopilot` drain on this pool.

**Completed**: none.
