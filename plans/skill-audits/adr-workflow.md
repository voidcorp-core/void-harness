---
skill: adr-workflow
pack: core
status: shipped
strategy: native
target_loc: 200
matrix_row: plans/skill-decision-matrix.md#adr-workflow
audit_date: 2026-06-04
auditor: Folpe + Claude Opus 4.8
---

> **Promoted from pack-monorepo to core on 2026-06-04.** ADRs are a universal
> craftsman concern (the repo meta-rule already mandates logging non-obvious
> decisions), not monorepo-specific. The skill kept its content; the "monorepo"
> wording was generalized to "codebase". See `docs/DECISIONS.md`.

# Audit: core:adr-workflow

**Need.** Monorepo-scale structural decisions get lost when only documented in commit messages. Without an ADR convention, the "why" of foundational choices (Drizzle over Prisma, RSC by default, `(actions)` route group) decays into folklore.

**Wins.** Force-naming credible alternatives kills weak decisions before they merge. 50-line cap keeps ADRs read. Lifecycle (proposed → accepted → superseded, never edited) preserves audit trail.

**Loses to.** Bugfixes, refactors, personal opinions, anything already in PHILOSOPHY/PROJECT-DOCTRINE. Single-app projects (no monorepo scale).

**Composes with.** `void:writing-plans` (plans = work, ADRs = decisions). `void-monorepo:dependency-direction` (boundary choices are ADR-worthy). `void:commit-discipline` (paragraph-long commit "why" should become an ADR).

**Why not in core.** ADRs as practiced here are scoped to monorepo conventions (file naming, `@repo/*` boundaries). Single-app or non-monorepo projects use other patterns (Notion, Linear).
