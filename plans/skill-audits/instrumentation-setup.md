---
skill: instrumentation-setup
pack: harness-nextjs
status: shipped
strategy: distill
target_loc: 250
audit_date: 2026-06-01
---

# Audit: harness-nextjs:instrumentation-setup

**Need.** Next 16's `instrumentation.ts` is the single bootstrap point — but the Node-vs-Edge split, Sentry+OTel+pino composition, and client-side Sentry-as-separate-provider trap nobody knows on first setup. This skill ships the canonical pattern.

**Wins.** Dynamic-import-per-runtime pattern keeps Edge bundles slim. Concrete "what lives where" decision table. Verification checklist (5 throws to validate).

**Loses to.** Non-Next projects (Vite, Remix, Hono). Projects without Sentry / OTel (use `harness:observability` doctrine alone).

**Composes with.** `harness:observability` (doctrine — this skill is wiring). `harness:security-guidance` (Sentry user scope hashed). `harness-server:env-validation` (DSN env validated). `harness-nextjs:loading-error-boundaries` (error.tsx uses captured Sentry).

**Why not in core.** Next 16-specific bootstrap mechanism (`register()` export, NEXT_RUNTIME env, edge/node split).
