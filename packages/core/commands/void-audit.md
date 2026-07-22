---
description: Run the void-harness outbound audit — skills not invoked recently (from .void/usage.log), upstream deprecations, decision-matrix conflicts — and surface proposed deprecations.
allowed-tools: Bash(void-harness:*)
---

Run `void-harness audit` in the project root. The CLI is public on npm as
`voidharness` (command: `void-harness`); if it is not on PATH, run
`npx voidharness audit`. Summarize what it reports:
skills that have not fired recently (per `.void/usage.log`, populated by the
activation-meter hook), any upstream deprecations, and decision-matrix
conflicts. Present proposed deprecations as suggestions only — the user owns
whether any becomes a PR. HITL: never apply a deprecation automatically.
