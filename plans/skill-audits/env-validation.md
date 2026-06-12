---
skill: env-validation
pack: harness-server
status: shipped
strategy: native
target_loc: 250
audit_date: 2026-06-01
---

# Audit: harness-server:env-validation

**Need.** "Validate env" is an old principle that's still broken in 50% of projects. process.env.X scattered everywhere, optional fallbacks hiding config bugs, NEXT_PUBLIC_* leaking secrets. This skill ships the @repo/core/env pattern (Zod-validated, fail-at-boot) + the per-runtime sanity.

**Wins.** Canonical Zod schema split (server vs client). Per-runtime table (Node/Edge/browser). .env.example discipline. Anti-pattern list (fallback, non-null assertion, NEXT_PUBLIC for secrets).

**Loses to.** Single-file scripts (use direct process.env). Apps where env is < 3 variables (overhead > benefit).

**Composes with.** `harness:security-guidance` (env-as-trust-boundary). `harness-server:server-action` (actions import env). `harness-server:webhook-handler-pattern` (secrets via env). `harness-nextjs:instrumentation-setup` (DSN via env). `no-process-env-in-app` hook (mechanical enforcement).

**Why not in core.** Server-side concern; client env (NEXT_PUBLIC_*) overlap exists but the validation pattern is server-pack territory. Single-app frontend tools have different patterns.
