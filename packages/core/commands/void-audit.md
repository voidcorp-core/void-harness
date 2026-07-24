---
description: Run the outbound audit from local mission events and surface stale skills, upstream deprecations, conflicts, and HITL proposals.
allowed-tools: Bash(void-harness:*)
---

Run `void-harness audit` in the project root. The CLI is public on npm as
`voidharness` (command: `void-harness`); if it is not on PATH, run
`npx voidharness audit`. Summarize what it reports:
skills that have not fired recently (per `.void/runs/*/events.jsonl`, populated by the
activation-meter hook), any upstream deprecations, and decision-matrix
conflicts. Present proposed deprecations as suggestions only — the user owns
whether any becomes a PR. HITL: never apply a deprecation automatically.
