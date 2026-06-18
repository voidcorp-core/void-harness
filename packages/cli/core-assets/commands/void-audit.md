---
description: Run the void-harness outbound audit — skills not invoked recently (from .void/usage.log), upstream deprecations, decision-matrix conflicts — and surface proposed deprecations.
allowed-tools: Bash(void-harness:*), Bash(npx:*)
---

Run `void-harness audit` in the project root (fall back to
`npx @voidcorp/harness audit` only if the `void-harness` CLI is not on PATH). Summarize what it reports:
skills that have not fired recently (per `.void/usage.log`, populated by the
skill-usage-meter hook), any upstream deprecations, and decision-matrix
conflicts. Present proposed deprecations as suggestions only — the user owns
whether any becomes a PR. HITL: never apply a deprecation automatically.
