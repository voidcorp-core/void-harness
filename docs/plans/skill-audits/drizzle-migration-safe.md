---
skill: drizzle-migration-safe
pack: harness-server
status: shipped
strategy: native
target_loc: 300
phase: G
depends_on: [migrations-safety]
composes_with: [migrations-safety, server-action, observability, async-safety]
audit_date: 2026-06-01
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `harness-server:drizzle-migration-safe`

## Need

`harness:migrations-safety` (generic doctrine) covers principles: small steps, nullable-then-not-null, online index creation. It does NOT cover Drizzle Kit's specific gotchas: `drizzle-kit generate` not emitting `CONCURRENTLY`, schema declarations that must reflect end state, the `pgEnum` regeneration trap. Solaar uses Drizzle and would hit each of these on the first production migration.

This skill is the Drizzle concretization — same principles, concrete SQL and code samples a consumer can copy.

## Wins

- Iron rules upfront — 5 rules every Drizzle dev should pin to the monitor.
- Concrete patterns for the 5 most common migration types (NOT NULL add, index, rename, drop, FK, enum) with the exact SQL.
- Drizzle-specific gotchas section (the `drizzle-kit generate` quirks) — knowledge you only get from being burned once.

## Loses to

- Fresh schema with zero prod traffic: drizzle-kit push is fine, this skill is overkill. Declare exit condition upfront.
- Non-Postgres databases: skill mentions Postgres-only patterns (CONCURRENTLY, NOT VALID). Drizzle supports MySQL/SQLite, those would need their own variants.

## Composes with

- `harness:migrations-safety` — the doctrine; this skill is the operational form for Drizzle.
- `harness-server:server-action` — services must handle intermediate states (nullable column during step 1 → step 3).
- `harness:observability` — log migration timing + row counts; backfills appear as instrumentation events.
- `harness:async-safety` — large backfills MUST batch (LIMIT + LOOP), not single statements.

## Rejected ideas

- **Auto-edit drizzle-generated SQL** via a script that injects `CONCURRENTLY` / `NOT VALID`: rejected. Too magical; the human must understand the trade-off (CONCURRENTLY can leave INVALID indexes that need detection).
- **Enforcement hook** that blocks commits adding migrations without backfill counterparts: tempting but produces false positives (some migrations are genuinely "nullable add, never backfill needed"). Rule reads better than enforcer.
- **MySQL/SQLite patterns inline**: scope creep. If a consumer asks, we add a sibling skill.

## 2026-07-10 — "who runs `migrate`, and where" section added

The pack described how to *shape* safe DDL but never said who applies it. Added a
section splitting the two environments by owner: **dev/local the agent applies**
(local Postgres/pglite or an ephemeral Neon dev branch) *before* the ticket's test
passes, because Drizzle infers types from the schema and the suite queries real
tables — a stale DB fails spuriously or passes against the wrong shape; **production
CI applies** via a human-gated GitHub Actions step on merge, never a local command.
This is the concrete Drizzle/Neon counterpart to the generic ordering principle now
in `ticket-runner` step 3, and it operationalizes the `migrations-safety` anti-rule
"MUST NOT auto-apply migrations on push to main". Kept concrete (real `neonctl` +
`pnpm db:migrate` + a GH Actions excerpt); the generic doctrine stays in
`migrations-safety`. See `docs/DECISIONS.md` 2026-07-10.

## Open questions

- Should we add a companion CLI command `void-harness db plan` that reads a generated migration and warns about CONCURRENTLY/NOT VALID gaps? Tracked in [[harness-evolution]] as a future feature.
