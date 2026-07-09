---
description: Run the void-harness outbound audit — skills not invoked recently (from .void/usage.log), upstream deprecations, decision-matrix conflicts — and surface proposed deprecations.
allowed-tools: Bash(void-harness:*)
---

Run `void-harness audit` in the project root. The CLI is maintainer tooling,
distributed only via the harness repo (marketplace-only: `@voidcorp/harness` is
not published to npm — see docs/DECISIONS.md). If `void-harness` is not on PATH,
do NOT try `npx @voidcorp/harness` (it 404s); tell the user the maintainer CLI is
not installed. Summarize what it reports:
skills that have not fired recently (per `.void/usage.log`, populated by the
activation-meter hook), any upstream deprecations, and decision-matrix
conflicts. Present proposed deprecations as suggestions only — the user owns
whether any becomes a PR. HITL: never apply a deprecation automatically.
