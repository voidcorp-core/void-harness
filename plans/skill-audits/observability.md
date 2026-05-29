---
skill: observability
status: draft
strategy: distill
target_loc: 350
phase: D
depends_on: []
composes_with: [security-guidance, async-safety, systematic-debugging]
matrix_row: plans/skill-decision-matrix.md#observability
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `observability`

## Need

Without `observability`, prod debugging = guessing. Structured logging, trace IDs, error boundaries, metrics, Sentry breadcrumbs — these are not optional for a SaaS that ships. `observability` codifies what to log, what to trace, what to measure, what NOT to log (PII).

## Decision matrix anchor

- **Wins**: any code that runs in production. Logging structure, trace IDs, error boundaries, metrics emission
- **Loses to**: `security-guidance` on what NOT to log
- **Cannot decide**: alerting policy (ops concern)
- **Composes with**: every code-discipline skill

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| pino docs | https://getpino.io | reference | kept (structured logger, fast, dev-pretty) |
| OpenTelemetry semantic conventions | https://opentelemetry.io/docs/specs/semconv/ | reference | kept (attribute naming) |
| Charity Majors "Observability Engineering" | https://www.honeycomb.io/oreilly-observability-engineering | book | foundation (events over metrics, high-cardinality) |
| citypaul observability notes | citypaul/.dotfiles | reviewed | partially kept |
| Sentry best practices | https://docs.sentry.io | reference | kept (breadcrumbs, scopes, fingerprinting) |

## Adaptation strategy

`distill`. Author from sources. Stack-specific details (pino config, Sentry init) live in pack-nextjs-pwa.

## Hard rules (draft)

- Logger via `@repo/core/logger` (pino). `console.log` banned in committed code
- Structured logging only: never `logger.info("user " + id + " did X")`; use `logger.info({ userId: id, action: "X" })`
- Trace ID propagated through every request boundary (HTTP → DB → external API)
- Error boundaries at every async boundary (React error boundary for client; try/catch + log + rethrow as typed error at server)
- Errors logged WITH context: which user (anonymized), which request, which step. Stack trace alone is insufficient
- Metrics for: latency p50/p95/p99 on every endpoint, error rate, business event counts (signup, conversion, etc.)
- NO PII in logs: emails hashed, names redacted, tokens never logged. Composes with `security-guidance`
- Sentry integration: breadcrumbs on every user-facing action, scope with user ID (anonymized) + feature flags

## Modes — none

## Companion hooks

- `no-console-log-grep` (pre-commit) — fail if `console.log` / `console.error` / `console.warn` in staged business code (allowed in scripts/, allowed in tests with explicit allowlist)

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Default Sentry vs Highlight vs OpenObserve? Lean Sentry (default in void-starter), opt-in alternatives via pack.
- Metrics backend: Vercel Analytics + Sentry vs OpenObserve self-hosted? Defer to consumer; document patterns.
