---
skill: migrations-safety
status: reviewed
strategy: original
target_loc: 400
phase: D
depends_on: [tdd, observability]
composes_with: [security-guidance, code-review]
matrix_row: plans/skill-decision-matrix.md#migrations-safety
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `migrations-safety`

## Need

Without `migrations-safety`, a "simple" `ALTER TABLE ADD COLUMN NOT NULL DEFAULT 'x'` on a 10M-row Postgres table locks writes for minutes, dropping incoming traffic. A "harmless" `RENAME COLUMN` deploys before any code reads the new name and breaks every active request. The team learns from the incident; the harness should bake the lesson in from line one.

## Decision matrix anchor

- **Wins**: any DB schema change. Backfill strategy, locking analysis, rollback plan, two-phase changes, online schema patterns
- **Loses to**: nothing on its own domain. Stand-alone discipline
- **Cannot decide**: schema design (defers to `domain-driven-design` for aggregates / value objects)
- **Composes with**: `tdd` (test the migration on dev branch), `observability` (log the change, surface lock waits), `security-guidance` (no PII leak via migration logs)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Drizzle migrations docs | https://orm.drizzle.team/docs/migrations | reference | tactical (the syntax we use) |
| GoCardless "Zero-Downtime Postgres Migrations" | https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts/ | foundation | kept (locking analysis, two-phase patterns) |
| Strong Migrations (Rails) | https://github.com/ankane/strong_migrations | reviewed | kept (rule catalog ported to TS / Drizzle) |
| Neon branching | https://neon.tech/docs/introduction/branching | reference | kept (test migrations on dev branch first) |
| Supabase migration patterns | https://supabase.com/docs/guides/cli/local-development | reference | kept |
| pgroll | https://github.com/xataio/pgroll | reviewed | reference for advanced multi-version online schema |
| Postgres docs on ALTER TABLE locking | https://www.postgresql.org/docs/current/sql-altertable.html | reference | foundation (which DDL takes which lock) |

## Adaptation strategy

`original`. No single TS source covers this end-to-end. Strong Migrations (Ruby) provides the rule catalog; GoCardless provides the disciplined narrative; Drizzle is the tactical layer. Author for Drizzle + Neon (the void-starter default), with the two-phase-change pattern as the load-bearing discipline.

## What we keep (verbatim or near-verbatim)

- **Locking analysis required before merge** (GoCardless): every migration on a table with > 100k rows declares its lock impact in the PR. AccessExclusiveLock during a long operation = blocks all reads and writes; we MUST avoid.
- **Two-phase changes for risky DDL** (GoCardless + Strong Migrations):
  1. Schema change that is backwards-compatible (add nullable column, add new column with default, etc.)
  2. Deploy code that handles both old and new shapes
  3. Backfill
  4. Schema constraint tightening (NOT NULL, drop legacy)
  5. Deploy code that uses only the new shape
- **Backfill batches with transaction limits** (Strong Migrations): never `UPDATE ... WHERE 1=1` on a large table. Batch by primary key range, 10k rows per transaction, with progress logging (composes with `observability`).
- **Test on Neon dev branch before prod** (Neon): every migration runs on the dev branch first. CI gate. The dev branch has prod-shape data (or anonymized snapshot).
- **Rollback plan stated in PR description**: even forward-only migrations have an "if we have to back this out" plan documented.
- **Migrations are immutable once merged**: fixes go forward (new migration), never amend a merged migration. Why: existing environments have already applied the original.

## What we adapt

- **Drizzle-specific tactical patterns**: use `drizzle-kit generate` for the SQL, then HAND-REVIEW for safety before commit. Auto-generated migrations are starting points, not deliverables. Why: drizzle-kit does not encode locking-aware patterns; the human applies them.
- **Migration PR body template**: the PR body MUST include sections — Table affected, Approximate row count, Locking impact, Backfill strategy, Rollback plan, Tested on dev branch (SHA). Companion hook `migration-pr-template` warns if any section is missing.
- **Composition with `observability`**: every migration emits structured logs (progress every 1000 rows for backfills). Composes with `pack-monorepo`'s logger. Why: long-running migrations need visibility.
- **Composition with `tdd`**: migrations have INTEGRATION tests that run them against pglite or a dev DB branch (not unit tests). The test asserts the post-migration shape AND that existing data is preserved. Why: the cheapest place to catch a broken backfill is before prod.

## What we reject

- **Direct `NOT NULL` add** on a table with active writes (table rewrite + write lock): rejected. Two-phase: add nullable, backfill, add NOT NULL constraint as a SEPARATE migration.
- **Direct `RENAME COLUMN`** on a table referenced by active code: rejected. Two-phase: add new column, dual-write, migrate reads, drop old. Composes with backwards-compat code paths.
- **Direct column type change on a large table** (forces rewrite): rejected. Two-phase: add new column, backfill, swap, drop.
- **`DROP COLUMN`** referenced by active code: rejected. Deploy code that ignores the column FIRST, then DROP in a later migration.
- **Auto-applied migrations on push to main**: rejected. Migrations apply via an explicit deploy step (CD pipeline) with a manual approval for prod.
- **Inline `CREATE INDEX` on a large table** (blocking): rejected. Use `CREATE INDEX CONCURRENTLY`.
- **Modifying a merged migration**: rejected. Fix forward via a new migration.

## Hard rules surfaced by this skill

- **Every migration PR includes the body template** (Table, Row count, Locking impact, Backfill strategy, Rollback plan, Tested on dev branch SHA). Enforced by: SKILL.md + `migration-pr-template` hook + `code-review` blocks PRs without the template.
- **Migrations on tables > 100k rows undergo locking analysis**. Enforced by: SKILL.md + `code-review` flags missing analysis.
- **Banned DDL patterns blocked at lint level** (NOT NULL direct add, RENAME COLUMN direct, type change direct, DROP COLUMN before code migration). Enforced by: SKILL.md + `migration-lint` hook (greps SQL for banned patterns).
- **Backfills are batched with transaction limits + progress logging**. Enforced by: SKILL.md + `code-review`.
- **Indexes on large tables use `CONCURRENTLY`**. Enforced by: SKILL.md + `migration-lint` hook.
- **Migrations tested on Neon dev branch (or pglite for the smallest cases) before prod**. Enforced by: SKILL.md + CI gate in `pack-monorepo`.
- **Migrations are immutable once merged**. Enforced by: SKILL.md + `code-review` blocks PRs editing files under `<config.paths.migrations>` whose SHA is in the merged history.

## Modes — none

The discipline is uniform. Table size dictates the depth of analysis (a 1k-row table can tolerate things a 100M-row table cannot), but the body template is always written.

## Companion hooks

- `migration-lint` (pre-commit on `<config.paths.migrations>`) — greps SQL for banned patterns: `NOT NULL` direct add, `RENAME COLUMN` direct, `ALTER TYPE` on column direct, `DROP COLUMN`, `CREATE INDEX` without `CONCURRENTLY` on large tables. Warn-only at first (some patterns are legitimate on small / new tables); user tags `// migration-allow: <reason>` to suppress.
- `migration-pr-template` (pre-push when touching migrations) — warns if PR body lacks the required sections.

## Composition with other skills

- **With `tdd`**: integration tests on pglite or Neon dev branch.
- **With `observability`**: structured logs at backfill progress; surface lock waits via `pg_stat_activity` snapshot in long migrations.
- **With `security-guidance`**: migration logs MUST NOT include PII (composes with `observability` redaction).
- **With `code-review`**: dimension `correctness` includes "lock analysis present, banned patterns absent."
- **With `commit-discipline`**: migration commits' "why" includes the linked plan / spec for non-trivial schema changes.
- **With `writing-plans`**: schema changes that affect multiple tables / aggregates flow through brainstorming + plans first (composes with `domain-driven-design`).

## Anti-rules

- MUST NOT auto-apply migrations on push to main (manual deploy approval).
- MUST NOT amend a merged migration.
- MUST NOT decide schema design (DDD's call).
- MUST NOT decide deploy mechanics (pack / CI concern; this skill mandates "tested on dev branch first" but not "how the dev branch is provisioned").
- MUST NOT silently allow banned DDL patterns.
- MUST NOT skip the PR body template, even for "tiny" migrations.

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ≤ 400 LOC
- [ ] Frontmatter `description` ≤ 200 chars, mentions two-phase changes + backfill batches + Neon dev branch test + immutable post-merge as headline
- [ ] `.source` file lists GoCardless + Strong Migrations + Drizzle + Neon + pgroll + Postgres docs
- [ ] `migration-lint` and `migration-pr-template` hooks drafted at ≤ 100 LOC each
- [ ] PR body template published in `packages/core/claude/skills/migrations-safety/PR-TEMPLATE.md`
- [ ] Matrix row in `plans/skill-decision-matrix.md` matches this audit note
- [ ] Skill tests in `test/migrations-safety/` cover: banned-pattern detection (`NOT NULL` direct, RENAME direct, type change direct), missing-template detection, immutable-merge detection
- [ ] No overlap > 30% with other skills
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor
- [ ] Audit status moved from `reviewed` → `shipped` after first project consumes the skill

## Open questions

- **Default Drizzle migration runner config**: where do migrations live (`drizzle/`, `db/migrations/`, `migrations/`)? Lean `drizzle/` per Drizzle convention; `voidcorp.config.json` overrides via `paths.migrations`.
- **Online schema change tooling**: pg_repack vs pt-osc vs pgroll for very large tables. Lean: document pgroll as the escape hatch for billion-row tables; out of scope for default skill content.
- **Dev branch provisioning**: who runs the migrations on the dev branch — CI on every PR? On-demand via CLI? Lean CI on every PR touching migrations.
- **Migration squashing**: when to squash old migrations (after years of history)? Lean: never squash automatically. Document a manual annual squash procedure in `pack-monorepo` later.
- **Banned-pattern allowlist mechanism**: file-level `// migration-allow: <reason>` is simple. Per-statement granularity may be needed for complex migrations. Defer until first false positive.
