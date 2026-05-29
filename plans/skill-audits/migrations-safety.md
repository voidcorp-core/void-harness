---
skill: migrations-safety
status: draft
strategy: original
target_loc: 400
phase: D
depends_on: [tdd, observability]
composes_with: [security-guidance]
matrix_row: plans/skill-decision-matrix.md#migrations-safety
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `migrations-safety`

## Need

Without `migrations-safety`, a "simple" `ALTER TABLE ADD COLUMN NOT NULL DEFAULT 'x'` on a 10M-row prod DB locks writes for minutes, dropping all incoming traffic. `migrations-safety` enforces zero-downtime patterns: two-phase changes, backfill jobs, NOT NULL via separate constraint, never rename in one go.

## Decision matrix anchor

- **Wins**: any DB schema change. Backfill strategy, locking analysis, rollback plan, two-phase changes
- **Loses to**: nothing on its own domain. Stand-alone discipline
- **Cannot decide**: schema design (defers to `domain-driven-design`)
- **Composes with**: `tdd` (test the migration), `observability` (log the change)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Drizzle migrations docs | https://orm.drizzle.team/docs/migrations | reference | kept (tactical mechanics) |
| GoCardless "Zero-Downtime Postgres Migrations" | https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts/ | reviewed | foundation (locking analysis, two-phase patterns) |
| Strong Migrations (Rails) | https://github.com/ankane/strong_migrations | reviewed | kept (rule catalog ported to TS / Drizzle) |
| Neon branching | https://neon.tech/docs/introduction/branching | reference | kept (test migrations on dev branch first) |
| Supabase migration patterns | https://supabase.com/docs/guides/cli/local-development | reference | kept |

## Adaptation strategy

`original`. No single TS source covers this; Strong Migrations (Ruby) provides the rule catalog, GoCardless provides the discipline. Author for Drizzle.

## Hard rules (draft)

- NEVER: `ADD COLUMN NOT NULL` directly (table rewrite + write lock). DO: add nullable, backfill, add NOT NULL constraint
- NEVER: `RENAME COLUMN` directly on a table with active writes. DO: add new column, dual-write, migrate reads, drop old
- NEVER: change column type directly on a large table. DO: new column, backfill, swap, drop
- NEVER: `DROP COLUMN` referenced by active code. DO: deploy code that ignores it, then migration
- Backfill via batch + transaction limits (e.g., 10k rows at a time), with progress logging
- Every migration tested on Neon dev branch (or local pglite) before prod
- Lock impact analysis required for every migration on a table > 100k rows
- Rollback plan stated in the migration PR description
- Migrations versioned, immutable once merged. Fixes go forward, never amend a merged migration

## Modes — none

## Companion hooks

- `migration-lint` (pre-commit on migrations path) — fail on banned patterns (NOT NULL without backfill, RENAME direct, etc.)
- `migration-pr-template` — PR must declare table size, lock impact, rollback plan, backfill strategy

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Drizzle-kit migration generation: when to auto-generate vs hand-write. Lean auto-generate, hand-review and modify for non-trivial schema changes
- Online schema change tools (pg_repack, pt-osc) — out of scope for default skill, document as escape hatch for very large tables
