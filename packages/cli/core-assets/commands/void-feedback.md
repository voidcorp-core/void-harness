---
description: File a void-harness feedback issue (a gap or friction in the harness) directly on voidcorp-core/void-harness. HITL — drafted, confirmed, then opened; never fixes the harness from here.
---

The user hit something the harness should handle better (a missing skill, a
false-positive hook, a missing rule, a DX papercut). File it as an inbound
self-evolution issue on the harness tracker; do not fix the harness from here.

1. Infer the gap from the recent conversation (or ask one short clarifying
   question if it is unclear).
2. Apply the filing bar. Open an issue ONLY if the gap is BOTH **agnostic** (it
   would help any consumer, not just this project) AND **harness-worthy** (it
   would change a skill, hook, pack, CLI, or doctrine line). A project-specific
   rule goes to `.void/PROJECT-DOCTRINE.md` via `/learn` (Branch A) instead.
   When in doubt, do not file.
3. Draft the issue: a concise `<area>: <gap>` title and a 5-15 line body with
   what happened, the evidence, the source-project context (repo, commit SHA,
   file path), and a "What would unblock me" line.
4. Show the draft to the user and confirm. On confirmation, open it:
   `gh issue create --repo voidcorp-core/void-harness --label enhancement --title "..." --body "..."`.
   Triage happens on the tracker (taking the issue promotes it; closing it
   declines it) — there is no `proposed/` queue and no later push step.

This is the `learn` harness-gap flow (Branch B). Keep it HITL: an
issue is a proposal, confirmed before it is opened; never write into harness
doctrine automatically.
