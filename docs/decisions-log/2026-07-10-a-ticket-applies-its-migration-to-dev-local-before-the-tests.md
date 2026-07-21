---
date: 2026-07-10
title: "a ticket applies its migration to dev/local before the tests; prod migrations are CI-only"
---

## 2026-07-10: a ticket applies its migration to dev/local before the tests; prod migrations are CI-only

`ticket-runner`'s Migration-safety pass (step 3) covered how to *design* a safe schema change (two-phase,
batched backfill, locking) but was silent on *applying* it. That silence had a concrete cost: the downstream
TDD and E2E passes query the real database, and Drizzle infers its types from the schema, so a migration
that was generated but not applied leaves the dev DB stale — the tests then fail spuriously or, worse, pass
against the wrong shape. The cycle needed an explicit apply step, and an explicit boundary on *where* it may
apply.

Decision: once a migration is generated and safety-reviewed, the cycle **applies it to dev/local before the
test passes run**; and the cycle **only ever applies to dev/local — production migrations run through CI /
GitHub Actions on merge, never from a worker or session**. The generic ordering principle lives in
`ticket-runner` step 3; the concrete Drizzle/Neon "who runs `migrate`, and where" (local Postgres / pglite /
ephemeral Neon dev branch for dev, a human-gated `pnpm db:migrate` GH Actions step for prod) lives in the
`harness-server:drizzle-migration-safe` pack. The generic doctrine in `migrations-safety` is untouched.

Load-bearing choices:
- **Auto-apply to dev/local, never prod.** The credible alternatives were rejected: (a) also auto-applying to
  prod turns a coding-cycle side effect into an unreviewed deploy — it collides head-on with the existing
  `migrations-safety` anti-rule "MUST NOT auto-apply migrations on push to main"; (b) requiring a human to
  apply even the *dev* migration defeats a ticket cycle whose own tests need the real schema to mean anything.
  The split (agent owns dev, CI+human owns prod) is the only one that keeps both the tests honest and prod safe.
- **Ordering, not just existence.** The apply happens *before* TDD/E2E specifically, because those are the
  passes that read the schema. Applying "sometime during the ticket" is not enough — it has to precede the
  tests it unblocks.
- **Principle vs concretization split.** Ordering (env-agnostic) in the core skill; the Drizzle/Neon commands
  and the GH Actions excerpt in the pack. Keeps the core generic and the pack the single place the concrete
  "how" lives, consistent with the pack/core boundary elsewhere in the harness.

Why: a migration the agent designs but never applies is a schema the tests never actually exercise — the
safety pass would sign off on DDL the suite ran green *around*, not *against*. Making the apply an ordered
step closes that gap; fencing prod behind CI keeps the convenience from ever becoming an unreviewed
production deploy.
