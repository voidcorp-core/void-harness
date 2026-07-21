---
date: 2026-07-10
title: "no native ship skill — ticket-runner pass 11 + gh + release-please IS the ship path (DEV-400)"
---

## 2026-07-10: no native ship skill — ticket-runner pass 11 + gh + release-please IS the ship path (DEV-400)

Second teardown-unblocking ticket. The routing pointed `Ship | gstack (/ship)` and `code-review` named `ship
(gstack)` downstream. gstack `/ship` did: run tests, bump version, write changelog, commit, push, open the PR.

Decision: **do not vendor a `harness:ship` skill.** Every step /ship performed is already owned:
- tests → `harness:verification-before-completion`;
- version + changelog → **release-please** (automated, never hand-bumped — see RELEASING.md);
- commit → `harness:commit-discipline`; PR → `ticket-runner` pass 11 (Ship) + `gh`.
A dedicated ship skill would be a thin orchestrator over skills that already compose — YAGNI. Evidence: every PR
in this de-gstack epic (#82–#96, ~15 PRs) shipped via exactly `ticket-runner` + `gh` + release-please, no `/ship`.
Removed the gstack `/ship` routing (CLAUDE.md + AGENTS.md, in parity) and the `code-review` downstream ref;
the "vendored from gstack /ship" **attributions** in ticket-runner / verification-before-completion stay (they
credit a vendored methodology, not a live dependency).

Same PR, a **stale-ref sweep** (DEV-390 loose ends found during the teardown inventory, too small to ticket):
`ticket-runner`'s UX pass said "QA stays gstack /qa until Vague 4" → now `harness:qa`; `verification`'s mobile
row said "gstack /browse" → claude-in-chrome via `harness:qa`; `source-driven-development` mislabelled
`/defuddle` as gstack (it is a standalone `.agents` skill) → delabelled. The decision-matrix cross-cutting rule
"work that belongs to gstack (QA, design, ship, browser)" was rewritten — those are now harness-native homes.

Remaining live gstack composition after this ticket: only `/benchmark` + `/benchmark-models` + `/claude-api`
(DEV-401). Then the teardown (DEV-395) is unblocked.

Why: the harness already ships things well without a ship skill; the only thing missing was honest routing.
Building a `harness:ship` to replace a routing line would add surface, not capability.
