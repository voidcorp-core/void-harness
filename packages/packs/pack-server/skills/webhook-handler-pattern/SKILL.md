---
name: webhook-handler-pattern
description: Build a webhook handler with signature verification, idempotency, and dead-letter routing using withWebhookSafety. Per-source patterns (Stripe, Resend, GitHub). Composes with async-safety and server-action.
---

# webhook-handler-pattern

Use when adding any inbound webhook endpoint (Stripe, Resend, GitHub, custom). Webhooks are **untrusted POST endpoints** that fire from external systems — every wrong handler is either a security breach (forged events accepted), a duplicate-charge bug (no idempotency), or a silent failure (no dead-letter).

This skill is the void-harness operational form for webhooks. Composes with `void:async-safety` (the doctrine) and `void:security-guidance` (Zod trust boundary).

## Location

```
apps/<app>/src/app/api/webhooks/<source>/route.ts
```

One folder per source. Path stable (external systems POST to a fixed URL — never rename without coordinating).

## The 5 non-negotiable layers

```
1. Signature verification  — verify the event came from the source
2. Idempotency             — same event delivered twice = one effect
3. Zod validation          — parsed shape matches what handler expects
4. Service call            — the business work (in apps/<app>/src/services/)
5. Acknowledgment          — return 2xx on success; specific codes on failure
```

Skipping ANY of these is a Sev-2 waiting. There are no exceptions.

## Canonical handler

```ts
// apps/web/src/app/api/webhooks/stripe/route.ts
import { withWebhookSafety } from '@voidcorp/pack-server';
import { stripe } from '@/adapters/stripe';
import { logger, env } from '@repo/core';
import { handleStripeEvent } from '@/services/billing/stripe';
import { z } from 'zod';

// 1. Schema validates the EVENT object after Stripe parses it.
const Event = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.unknown() }),
  livemode: z.boolean(),
});

export const POST = withWebhookSafety({
  source: 'stripe',
  // 1. Signature verification (Stripe-specific)
  verify: async (req) => {
    const sig = req.headers.get('stripe-signature');
    const body = await req.text();
    return stripe.webhooks.constructEvent(body, sig!, env.STRIPE_WEBHOOK_SECRET);
  },
  // 2. Idempotency key extraction (Stripe's event.id is globally unique)
  idempotencyKey: (event) => `stripe:${event.id}`,
  // 3. Zod re-validation (defense in depth)
  schema: Event,
  // 4. Handler — pure dispatch into services/
  handler: async ({ event, log }) => {
    log.info({ event: 'webhook.received', source: 'stripe', type: event.type, eventId: event.id });
    await handleStripeEvent(event);   // service does the work
    return { ok: true };
  },
});
```

`withWebhookSafety` wraps:

- Signature verification (calls `verify`, throws 401 if failed)
- Idempotency check via inbox table (key = `idempotencyKey(event)`)
- Zod re-parse
- Trace context (Sentry breadcrumb, OTel span)
- Acknowledgment (2xx success, 4xx for permanent failures, 5xx for retryable)

## Per-source notes

### Stripe

- Signature: `stripe-signature` header, verified via `stripe.webhooks.constructEvent`
- Idempotency: `event.id` is the canonical key
- Retry: Stripe retries failed webhooks with exponential backoff for up to 3 days
- Test mode: separate `STRIPE_WEBHOOK_SECRET_TEST` env

### Resend

- Signature: `svix-signature` header, verified via `Webhook.verify` from `svix`
- Idempotency: `svix-id` header
- Retry: Svix retries automatically; you only see the first failure if your endpoint returns 5xx

### GitHub

- Signature: `x-hub-signature-256` header (HMAC SHA-256)
- Idempotency: `x-github-delivery` header (UUID)
- Retry: GitHub does NOT auto-retry. If you return 5xx, the event is lost. Make sure dead-letter is robust.

### Custom (internal services calling each other)

- Signature: HMAC SHA-256 with a shared secret (`@voidcorp/pack-server` exports `verifyHmac`)
- Idempotency: caller-generated UUID v7 in `x-idempotency-key`
- Retry: caller's responsibility; receiver acknowledges with 2xx + the key it already saw

## Inbox table

The idempotency check needs persistent storage:

```sql
CREATE TABLE webhook_inbox (
  key text PRIMARY KEY,                         -- e.g., "stripe:evt_xxx"
  source text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  payload jsonb NOT NULL
);
CREATE INDEX idx_webhook_inbox_received ON webhook_inbox (received_at);
```

On webhook receive: `INSERT ON CONFLICT DO NOTHING`. If the insert returned a row, this is a NEW event → process it. If not, it's a re-delivery → return 2xx with the cached response.

Migration safely via `void-server:drizzle-migration-safe`.

## Dead-letter routing

When the handler throws an unrecoverable error (data shape unexpected, downstream service permanently broken):

```ts
handler: async ({ event }) => {
  try {
    await processEvent(event);
  } catch (err) {
    if (isPermanentFailure(err)) {
      await deadLetter.enqueue({ key, source, error: err.message, payload: event });
      return { ok: false, retry: false };   // tell sender "don't retry, we got it but rejected"
    }
    throw err;                              // retryable — let sender retry
  }
};
```

Dead letter = a queue/table the team reviews. UI: `Settings → Webhook DLQ`. Never silently drop.

## Error response codes

| Code | Means | Sender behavior |
|---|---|---|
| 200/202 | Accepted | Stops retrying |
| 401 | Invalid signature | Stops retrying (Stripe, GitHub will flag the endpoint) |
| 4xx (other) | Permanent failure (bad event shape) | Stops retrying — log this for investigation |
| 5xx | Transient failure | Retries with backoff (Stripe/Svix); GitHub doesn't retry |

NEVER return 200 to a malformed event (you'd accept invalid data). 4xx with a logged DLQ entry is the right pattern.

## Anti-patterns

- ✗ **No signature verification** — anyone with the URL can forge events
- ✗ **Idempotency key = `Date.now()`** — re-delivery NOT detected; double-charges
- ✗ **Calling services synchronously for slow work** — if the handler takes > 10s, the sender retries. Enqueue background jobs for slow work.
- ✗ **Returning 5xx to "make sender retry" without enqueueing** — sender's backoff is unpredictable; use your own queue
- ✗ **One handler for all sources** (`/api/webhooks/route.ts` switching on `source`) — different signatures, different idempotency keys, different retry semantics. One folder per source.

## Testing

- Unit-test the verifier with a real (sanitized) payload from the source's docs
- Integration-test by running the handler against a captured event JSON
- E2E: use Stripe CLI / Svix CLI / ngrok to deliver real webhooks to a dev endpoint

## Composition

- `void:async-safety` — doctrine on retry, idempotency, dead-letter (this skill is the webhook concretization).
- `void-server:server-action` — Server Actions and webhooks both cross trust boundaries; same Zod discipline.
- `void-server:drizzle-migration-safe` — the inbox table migration follows this pattern.
- `void-server:env-validation` — webhook secrets validated in `@repo/core/env`.
- `void:observability` — trace context per webhook receive; Sentry breadcrumb.
- `void:security-guidance` — Zod re-validation IS the trust boundary.
