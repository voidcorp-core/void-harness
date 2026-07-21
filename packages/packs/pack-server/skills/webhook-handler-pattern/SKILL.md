---
name: webhook-handler-pattern
description: Build a webhook handler with signature verification, idempotency, and dead-letter routing. Per-source patterns (Stripe, Resend, GitHub). Self-contained — no harness wrappers required.
owner: folpe
---

# webhook-handler-pattern

Use when adding any inbound webhook endpoint (Stripe, Resend, GitHub, custom). Webhooks are **untrusted POST endpoints** that fire from external systems — every wrong handler is either a security breach (forged events accepted), a duplicate-charge bug (no idempotency), or a silent failure (no dead-letter).

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

Skipping ANY of these is a Sev-2 waiting. The pattern below shows the 5 layers explicit — no wrapper assumed.

## Canonical handler (explicit, self-contained)

```ts
// apps/web/src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { db } from '@/adapters/db';
import { env, logger } from '@repo/core';
import * as Sentry from '@sentry/nextjs';
import { handleStripeEvent } from '@/services/billing/stripe';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// 3. Zod schema for the parsed Stripe event (defense in depth — Stripe's
//    own parser is trusted, but we re-shape to our service contract).
const EventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.unknown() }),
  livemode: z.boolean(),
});

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  const idempotencyKey = `stripe:${req.headers.get('stripe-signature')?.slice(0, 16) ?? ''}`;

  let stripeEvent: Stripe.Event;
  try {
    // 1. Signature verification (Stripe-specific)
    if (!sig) {
      return NextResponse.json({ error: 'missing signature' }, { status: 401 });
    }
    stripeEvent = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn({ event: 'webhook.signature_invalid', source: 'stripe' });
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  // 2. Idempotency — Stripe's event.id is globally unique
  const inboxKey = `stripe:${stripeEvent.id}`;
  const inserted = await db
    .insert(webhookInbox)
    .values({ key: inboxKey, source: 'stripe', eventType: stripeEvent.type, payload: stripeEvent })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    // Already seen — return 2xx to stop Stripe retrying
    logger.info({ event: 'webhook.duplicate', source: 'stripe', eventId: stripeEvent.id });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // 3. Re-validate with our schema
  const event = EventSchema.parse(stripeEvent);

  // 4. Service call — pure dispatch
  logger.info({ event: 'webhook.received', source: 'stripe', type: event.type, eventId: event.id });
  try {
    await handleStripeEvent(event);
    await db.update(webhookInbox).set({ committedAt: new Date() }).where(eq(webhookInbox.key, inboxKey));
    // 5. Ack
    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err, { tags: { webhook: 'stripe', eventType: event.type } });
    // Retryable: return 5xx so Stripe retries with backoff
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

The 5 layers are explicit. No wrapper is required. If your project ships its own `withWebhookSafety` helper that bundles these 5, that's a convenience — but the pattern is the substance, and it's the same.

## Per-source notes

### Stripe

- Signature: `stripe-signature` header → `stripe.webhooks.constructEvent`
- Idempotency: `event.id` is the canonical key
- Retry: Stripe retries failed webhooks with exponential backoff for up to 3 days
- Test mode: separate `STRIPE_WEBHOOK_SECRET_TEST` env var

### Resend (via svix)

- Signature: `svix-id`, `svix-timestamp`, `svix-signature` headers → `new Webhook(secret).verify(body, headers)` from `svix` package
- Idempotency: `svix-id` header
- Retry: Svix retries automatically; you only see the first failure if your endpoint returns 5xx

### GitHub

- Signature: `x-hub-signature-256` header (HMAC SHA-256 of the body with your secret)
- Idempotency: `x-github-delivery` header (UUID)
- Retry: GitHub does NOT auto-retry. If you return 5xx, the event is lost. Make sure dead-letter is robust.

### Custom (internal services calling each other)

- Signature: HMAC SHA-256 with a shared secret. Use Node's `crypto.timingSafeEqual` for the compare (constant-time, no early-exit on mismatch).
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

Migration follows the safe-migration pattern (see `drizzle-migration-safe` skill).

## Dead-letter routing

When the handler decides the error is permanent (validation failure, downstream API said 4xx):

```ts
catch (err) {
  if (isPermanentFailure(err)) {
    await db.insert(webhookDeadLetter).values({
      key: inboxKey,
      source: 'stripe',
      error: err.message,
      payload: event,
      receivedAt: new Date(),
    });
    return NextResponse.json({ ok: false, retry: false }, { status: 400 });
    // 4xx tells Stripe "permanent — stop retrying"
  }
  throw err;   // retryable — let the 5xx propagate
}
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
- ✗ **Calling services synchronously for slow work** — if the handler takes > 10s, the sender retries. Enqueue background jobs for slow work (see `background-job-pattern`).
- ✗ **Returning 5xx to "make sender retry" without enqueueing** — sender's backoff is unpredictable; use your own queue
- ✗ **One handler for all sources** (`/api/webhooks/route.ts` switching on `source`) — different signatures, different idempotency keys, different retry semantics. One folder per source.
- ✗ **`==` for HMAC comparison** — use `crypto.timingSafeEqual`. Constant-time compare prevents timing attacks.

## Testing

- Unit-test the verifier with a real (sanitized) payload from the source's docs
- Integration-test by running the handler against a captured event JSON
- E2E: use Stripe CLI / Svix CLI / ngrok to deliver real webhooks to a dev endpoint

## Composition (informational)

- `harness:async-safety` — generic retry, idempotency, dead-letter doctrine.
- `harness-server:server-action` — both cross trust boundaries; same Zod discipline.
- `harness-server:drizzle-migration-safe` — inbox table migration follows the safe pattern.
- `harness-server:env-validation` — webhook secrets validated in `@repo/core/env`.
- `harness:observability` — trace context per receive; Sentry breadcrumb.
- `harness:security-guidance` — Zod re-validation IS the trust boundary; HMAC compare with constant-time.
