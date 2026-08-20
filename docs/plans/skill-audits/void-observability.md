---
skill: observability
status: reviewed
strategy: distill
target_loc: 350
phase: D
depends_on: []
composes_with: [security-guidance, async-safety, debug, code-review]
matrix_row: plans/skill-decision-matrix.md#observability
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `observability`

## Need

Without `observability`, production debugging = guessing. A user reports a vague failure; the dev team has no breadcrumbs, no trace ID, no structured context. The "fix" is whatever quiets the noise, not what addresses the cause. `observability` codifies what to log, what to trace, what to measure, and (just as critical) what NOT to log (PII, secrets).

## Decision matrix anchor

- **Wins**: any code that runs in production. Logging structure, trace IDs, error boundaries, metrics emission
- **Loses to**: `security-guidance` on what NOT to log (PII, secrets)
- **Cannot decide**: alerting policy (ops concern), retention windows (compliance concern)
- **Composes with**: every code-discipline skill, `debug` (visibility before debugging), `async-safety` (trace propagation across job boundaries)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| pino logger docs | https://getpino.io | reference | kept (structured logger, fast, dev-pretty mode, child loggers for scope) |
| OpenTelemetry semantic conventions | https://opentelemetry.io/docs/specs/semconv/ | reference | kept (attribute naming, trace/span model) |
| Charity Majors "Observability Engineering" | https://www.honeycomb.io/oreilly-observability-engineering | book | foundation (events over metrics, high-cardinality, "explore production") |
| Sentry best practices | https://docs.sentry.io | reference | kept (breadcrumbs, scopes, fingerprinting, before-send for PII scrubbing) |
| citypaul/.dotfiles observability notes | citypaul/.dotfiles | reviewed | partially kept (logger-only discipline, no console.log in committed code) |
| Cindy Sridharan "Distributed Systems Observability" | https://www.oreilly.com/library/view/distributed-systems-observability/9781492033431/ | reference | foundation (three pillars: logs, metrics, traces — but not as silos) |

## Adaptation strategy

`distill`. Author from sources. Stack-specific details (pino config, Sentry init, Vercel Analytics integration) live in `pack-nextjs-pwa`.

## What we keep (verbatim or near-verbatim)

- **Structured logging only** (pino + Majors): `logger.info({ userId, action, durationMs }, "operation complete")` — NEVER string interpolation. Why: structured logs are queryable; strings are searchable at best.
- **Three pillars composed, not siloed** (Sridharan): logs, metrics, traces share trace IDs. A single user request can be followed across all three.
- **Events over metrics** (Majors): a "user_signup_succeeded" event with high-cardinality attributes (user country, device type, signup path) beats a "signup_count" metric for understanding WHY signups vary.
- **High-cardinality attributes are valuable** (Majors): user ID (anonymized), feature flags active, session ID, browser version, region. Logging them costs little; not logging them costs investigation hours.
- **`console.log` banned in committed code** (citypaul): use the project logger. `console.log` is fine in `*.test.ts` and in `scripts/`; banned in `src/`.

## What we adapt

- **Project logger via `@repo/core/logger`** (pino) — provided by `pack-monorepo`. Adapter pattern: business code imports `logger`, not pino directly. Why: enables swapping the backend (pino → OTel → vendor SDK) without business-code changes.
- **Trace ID propagated through every request boundary** — HTTP → DB → external API. The companion utility `withTraceContext()` (in `pack-monorepo`) wraps Server Actions and webhooks. Composes with `async-safety` for job boundary trace propagation.
- **Error boundaries at every async boundary** — React `ErrorBoundary` for client-side, try/catch + log + rethrow as typed error at server-side adapters. Composes with `hexagonal-architecture` (adapter is where the catch lives).
- **Sentry default, breadcrumbs scoped with anonymized user ID** — `Sentry.setUser({ id: hash(userId) })` not the email. `Sentry.addBreadcrumb` at every business event. Composes with `security-guidance` (PII redaction).
- **Metrics: latency p50/p95/p99, error rate, business event counts** — collected via Vercel Analytics + Sentry. The skill states WHAT to measure; the pack provides HOW.

## What we reject

- **`console.log` in committed business code**: rejected. Use the logger.
- **String-interpolated logs**: rejected. `logger.info("user " + id + " did X")` — replace with `logger.info({ userId: id, action: "X" })`.
- **Logging full request bodies**: rejected. Bodies contain PII / secrets / massive payloads. Log specific fields with explicit allowlist.
- **Per-request logger instantiation**: rejected. Use the singleton + child loggers via `logger.child({ traceId })`.
- **Custom log levels beyond the standard set** (`fatal`, `error`, `warn`, `info`, `debug`, `trace`): rejected. The standard set is enough.
- **Silent error swallowing**: rejected. Every catch either logs OR rethrows (often both). A `catch (e) {}` is a Red Flag.

## Hard rules surfaced by this skill

- **Logger via `@repo/core/logger`. `console.log` banned in committed business code**. Enforced by: SKILL.md + `no-console-log-grep` hook (already declared in Phase B, lives in `core/hooks/` or `pack-monorepo`).
- **Structured logs only**. Enforced by: SKILL.md + `code-review` flags string-interpolation logs.
- **Trace ID propagated end-to-end**. Enforced by: `pack-monorepo` provides `withTraceContext()` wrapper; SKILL.md mandates usage.
- **Error boundaries at every async boundary**. Enforced by: SKILL.md + `code-review` flags catch-without-action.
- **Errors logged WITH context** (userId anonymized, request, step). Enforced by: SKILL.md + `code-review`.
- **No PII / no secrets in logs**. Enforced by: SKILL.md (composes with `security-guidance`) + logger config redacts known-secret keys at serialization.
- **Sentry integration: anonymized user scope + breadcrumbs at business events**. Enforced by: `pack-nextjs-pwa` provides Sentry config + SKILL.md mandates usage.

## Modes — none

The discipline is uniform. Intensity scales with criticality (a side-project may emit fewer metrics; a SaaS must emit them all).

## Companion hooks

- `no-console-log-grep` (pre-commit) — fails if `console.log` / `console.error` / `console.warn` appears in staged business code. Allowed in `scripts/`, allowed in `**/*.test.{ts,tsx}` with explicit allowlist marker. ≤ 50 LOC.

(Sentry / pino / OTel integration lives in `pack-nextjs-pwa` because it is stack-specific.)

## Composition with other skills

- **With `security-guidance`**: PII / secrets MUST NOT appear in logs. Logger config redacts at serialization.
- **With `debug`**: if visibility is the gap, fix it FIRST (add the missing logs / breadcrumbs / traces) — then debug with real signal.
- **With `async-safety`**: trace ID propagation across job / webhook / queue boundaries. The trace follows the work.
- **With `hexagonal-architecture`**: error boundaries live at adapter boundaries; logging at use-case entry/exit.
- **With `code-review`**: flags missing observability (no log at use-case entry, no breadcrumb at business event, error swallowing).
- **With `commit-discipline`**: `feat:` commits adding business logic mention "added structured logging at <surface>" in the body.

## Anti-rules

- MUST NOT decide alerting policy (ops concern).
- MUST NOT decide retention windows (compliance concern).
- MUST NOT decide which observability vendor (pack concern; Sentry is the default but consumers can override).
- MUST NOT silently allow `console.log` in business code.
- MUST NOT log PII or secrets, ever — composes with `security-guidance`.
- MUST NOT decide UI dashboards / runbooks (ops / on-call concern).

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ≤ 350 LOC
- [ ] Frontmatter `description` ≤ 200 chars, mentions structured logs + trace IDs + error boundaries + no PII / secrets as headline
- [ ] `.source` file lists pino + OpenTelemetry + Charity Majors + Sentry + citypaul + Sridharan
- [ ] `no-console-log-grep` hook drafted at ≤ 100 LOC, smoke-tested
- [ ] `pack-nextjs-pwa` Sentry + pino + Vercel Analytics defaults documented
- [ ] Matrix row in `plans/skill-decision-matrix.md` matches this audit note
- [ ] Skill tests in `test/observability/` cover: console.log detection, string-interpolation log detection, error-swallowing detection, missing trace context detection
- [ ] No overlap > 30% with `security-guidance` (this skill = visibility; security = what to not show)
- [ ] No overlap > 30% with `debug` (this skill = visibility infra; debugging = root cause discipline)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor
- [ ] Audit status moved from `reviewed` → `shipped` after first project consumes the skill

## Open questions

- **Default observability vendor**: Sentry vs Highlight vs OpenObserve. Lean Sentry (default in void-starter). Highlight as opt-in via pack. Document the trade-off (Sentry has best React SDK; Highlight has session replay built-in; OpenObserve self-host friendly).
- **Metrics backend at solopreneur scale**: Vercel Analytics + Sentry built-ins suffice. Self-hosted Grafana later. Document the decision tree in SKILL.md.
- **Trace ID format**: W3C TraceContext (default OpenTelemetry) vs random UUID. Lean W3C for compatibility with future vendor swaps.
- **Sampling strategy**: 100% in dev, head-based sampling in prod (10% by default, 100% for errors). Document defaults in pack-nextjs-pwa.
- **Custom dimensions for business events**: how strict on the cardinality? Lean: any business-meaningful attribute allowed (user country, plan tier, feature flag), with the constraint that the logger config can drop them at serialization if a future cost concern arises.
