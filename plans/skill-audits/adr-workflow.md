---
skill: adr-workflow
pack: void-monorepo
status: shipped
strategy: native
target_loc: 200
audit_date: 2026-06-01
---

# Audit: void-monorepo:adr-workflow

**Need.** Monorepo-scale structural decisions get lost when only documented in commit messages. Without an ADR convention, the "why" of foundational choices (Drizzle over Prisma, RSC by default, `(actions)` route group) decays into folklore.

**Wins.** Force-naming credible alternatives kills weak decisions before they merge. 50-line cap keeps ADRs read. Lifecycle (proposed → accepted → superseded, never edited) preserves audit trail.

**Loses to.** Bugfixes, refactors, personal opinions, anything already in PHILOSOPHY/PROJECT-DOCTRINE. Single-app projects (no monorepo scale).

**Composes with.** `void:writing-plans` (plans = work, ADRs = decisions). `void-monorepo:dependency-direction` (boundary choices are ADR-worthy). `void:commit-discipline` (paragraph-long commit "why" should become an ADR).

**Why not in core.** ADRs as practiced here are scoped to monorepo conventions (file naming, `@repo/*` boundaries). Single-app or non-monorepo projects use other patterns (Notion, Linear).
