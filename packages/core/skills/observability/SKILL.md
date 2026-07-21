---
name: observability
activation: always
description: Structured logs (no string interp), trace IDs end-to-end, error boundaries at async boundaries, anonymized user scope, no PII/secrets ever. Use @repo/core/logger not console.log. Use for prod code.
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: pretooluse
    codex: pretooluse
    hermes: ci-only
---

# observability — voidcorp craftsman edition

Production debugging starts where observability ended. If you cannot see what happened, you cannot fix it; if you can only guess, you fix the symptom and the bug recurs. This skill codifies what to log, what to trace, what to measure — and just as critically, what NEVER to log (PII, secrets).

**Attribution**: see `.source`. Foundation: pino + OpenTelemetry semantic conventions + Charity Majors "Observability Engineering" + Sentry best practices + Sridharan three pillars.

---

## Structured logs only

```typescript
// banned
console.log('user ' + userId + ' did ' + action);
logger.info(`user ${userId} did ${action}`);

// allowed
logger.info({ userId, action, durationMs }, 'user_action');
```

Structured logs are queryable. String-interpolated logs are searchable at best.

The companion hook `no-console-log-grep` blocks `console.log` / `console.error` / `console.warn` in business code.

### Use `@repo/core/logger` (pino)

Provided by `pack-monorepo`. Business code imports `logger`, not pino directly — the adapter pattern lets us swap the backend later without business-code edits.

```typescript
import { logger } from '@repo/core/logger';

logger.info({ userId, orderId }, 'checkout_started');
logger.error({ err, orderId }, 'payment_failed');
```

### Levels (standard set, no custom levels)

| Level | When |
|---|---|
| `fatal` | Unrecoverable — process must exit |
| `error` | Operation failed; user impact |
| `warn` | Unexpected but handled |
| `info` | Significant business event |
| `debug` | Developer-time signal |
| `trace` | Very granular (rarely committed) |

---

## Trace IDs propagate end-to-end

A user request crosses HTTP → service → DB → external API → response. The trace ID follows.

```typescript
// in pack-nextjs Server Action wrapper
import { withTraceContext } from '@repo/observability';

export const checkoutAction = withTraceContext(async (input: CheckoutInput) => {
  const traceId = getTraceId();
  logger.info({ traceId, cartId: input.cartId }, 'checkout_action');
  // every downstream log inherits traceId via logger.child({ traceId })
  return checkoutCart(deps, input);
});
```

Composes with `async-safety` — the trace propagates across job / webhook / queue boundaries via the message envelope.

### Default trace format

W3C TraceContext (the OpenTelemetry default). Compatible with future vendor swaps (Sentry, Honeycomb, Datadog, OTel collector).

---

## Error boundaries at every async boundary

### Client side (React)

```tsx
<ErrorBoundary
  fallback={<ErrorView />}
  onError={(err, info) => Sentry.captureException(err, { extra: info })}
>
  <Checkout />
</ErrorBoundary>
```

### Server side

```typescript
async function callStripe(...): Promise<Result<Charge, StripeError>> {
  try {
    const charge = await stripe.charges.create(...);
    return ok(translateCharge(charge));
  } catch (err) {
    logger.error({ err, customerId }, 'stripe_charge_failed');
    return err({ kind: 'stripe_error', cause: serializeError(err) });
  }
}
```

The adapter (per `hexagonal-architecture`) is where the catch lives. The error is logged WITH context. Then re-rethrown as a typed `Result` error, OR (for truly unexpected) re-rethrown raw so Sentry catches it at the top.

### Silent error swallowing — Red Flag

```typescript
// banned
try { await doSomething(); } catch (e) { /* swallow */ }
```

Either log it, or rethrow, or both. `catch (e) {}` is rejected.

---

## High-cardinality attributes are valuable

Majors' rule. Log:

- User ID (anonymized — `userId: hash(realId)` for Sentry; raw in internal logs only if compliance allows)
- Org / tenant ID
- Feature flags active
- Session ID
- Browser / device / region
- Business-meaningful tags (plan tier, signup source, conversion path)

The cost is small. The benefit during investigation is "I can filter to the exact 12 users hit by this bug." Cardinality is not the enemy; pre-aggregation is.

---

## Metrics — what to emit

| Metric | Why |
|---|---|
| Latency p50 / p95 / p99 per endpoint | User-perceived experience |
| Error rate per endpoint | SLO tracking |
| Business event counts (signup, checkout, conversion, churn) | Growth signal |
| Queue depth / lag (jobs, webhooks) | Backlog detection |
| Cost per business event (LLM tokens, third-party calls) | Composes with `llm-cost-discipline` |

The skill mandates WHAT. The pack (`pack-nextjs`) provides HOW (Vercel Analytics + Sentry + custom emitters).

---

## Sentry integration (default)

Provided by `pack-nextjs`. Defaults:

- `Sentry.setUser({ id: hash(userId) })` — anonymized scope
- `Sentry.addBreadcrumb` at every business event
- `beforeSend` redacts known-secret keys + PII attributes
- Fingerprinting by error class + message hash (deduplicates noise)
- Performance monitoring at 10% sampling (head-based) in prod, 100% in dev

Switch via `voidcorp.config.json` if a project chooses Highlight / OpenObserve / vendor X.

---

## No PII, no secrets, ever (composes with `security-guidance`)

```typescript
// banned
logger.info(`user ${user.email} signed in with password ${password}`);

// allowed
logger.info({ userId: user.id, event: 'sign_in_success' });
```

### Logger config redacts at serialization

`pack-monorepo` provides:

```typescript
const logger = pino({
  redact: ['password', 'token', 'apiKey', 'secret', 'authorization', '*.email', '*.phone'],
});
```

Defense in depth. The discipline says "don't log it." The config says "even if you slip, the serialized output drops it." Both layers must hold.

---

## What NOT to log

- Full request bodies (PII / secrets / massive payloads). Log specific fields with explicit allowlist.
- Passwords, tokens, API keys, session IDs, JWTs (composes with `security-guidance`)
- Email addresses unredacted in production logs (consider hashing or partial redaction depending on compliance)
- Full database rows (PII risk)
- LLM full prompts / responses (PII + cost) — log token counts and structural metadata, not content
- Stack traces with embedded secrets (some Node errors include the secret in the stack)

---

## Composition with other skills

- **With `security-guidance`**: PII / secret redaction at log time. Logger config layer is defense in depth.
- **With `systematic-debugging`**: if visibility is the gap, FIX IT FIRST — add the missing logs / traces — then debug with real signal.
- **With `async-safety`**: trace propagation across job / webhook / queue boundaries.
- **With `hexagonal-architecture`**: error boundaries live at adapter boundaries; structured logging at use-case entry/exit.
- **With `llm-cost-discipline`**: token counts logged at every LLM call site. Cache hit rate logged.
- **With `code-review`**: flags missing observability (no log at use-case entry, no breadcrumb at business event, error swallowing).
- **With `commit-discipline`**: `feat:` commits adding business logic mention the observability surface added.

---

## Companion hooks

- `no-console-log-grep` (pre-commit) — fails if `console.log` / `console.error` / `console.warn` in staged business code. Allowed in `scripts/`, `**/*.test.{ts,tsx}` (with explicit allowlist marker). See `../../hooks/`.

(Sentry / pino / OTel integration code lives in `pack-nextjs` because stack-specific.)

---

## Anti-rules

- MUST NOT decide alerting policy (ops concern).
- MUST NOT decide retention windows (compliance concern).
- MUST NOT silently allow `console.log` in business code.
- MUST NOT log PII or secrets.
- MUST NOT swallow errors silently.
- MUST NOT use custom log levels.

---

## When you are stuck

| Problem | Solution |
|---|---|
| Cannot reproduce a bug in prod | Add observability first (logs / breadcrumbs / traces). Wait for next occurrence. |
| Logger output is overwhelming | Add structured filters in the query, not at the source. The signal you do not log is the one you wish you had. |
| Logging slows down a hot path | Async / batched log writes via the logger config. Pino is fast; the bottleneck is rarely the logger itself. |
| Sentry too noisy | Fingerprint better, not "drop the breadcrumb." Noise is a tuning problem, not a discipline problem. |
| LLM prompts too big to log | Log token counts + structural metadata (kind, length). Never the content. |

---

## Final rule

```
Production code → structured logs via @repo/core/logger, trace ID propagated, error boundaries present, no PII no secrets.
Otherwise → it is not voidcorp observability.
```

Visibility is the precondition for everything. Earn it once; benefit forever.
