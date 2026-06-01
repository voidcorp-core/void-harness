# Server-side conventions (`@voidcorp/pack-server`)

This pack covers the server trust boundary: Server Actions, webhook handlers, async safety wrappers, Drizzle migrations. It is **stack-agnostic** — works in Next.js, Hono, standalone Bun/Node servers.

## Trust boundaries are sacred

Every endpoint that receives data from outside the process is a **trust boundary**. Apply at every one:

1. **Auth** — `defineAction({ auth: 'required' })` or middleware
2. **Zod ingress** — schema validates the input object (no untyped `formData.get()`)
3. **Rate limit** — per-user or per-IP
4. **Observability** — `withTraceContext` propagates trace ID; Sentry user scope anonymized via `hash(userId)`
5. **Service call** — pure domain logic in `src/services/`

The skill `void-server:server-action` is the execution checklist; this module is the reference.

## Webhook handlers

```ts
import { withWebhookSafety } from '@voidcorp/pack-server';

export const POST = withWebhookSafety({
  source: 'stripe',
  verify: (req) => verifyStripeSignature(req, process.env.STRIPE_WEBHOOK_SECRET!),
  handler: async (event) => { /* ... */ },
});
```

Handles signature verification, idempotency keys (via Redis or Postgres `inbox` table), exponential retry backoff, dead-letter routing.

## Drizzle migrations safety

- Migrations live at `apps/<app>/db/migrations/` (Drizzle default).
- New columns: NULL or DEFAULT first, then backfill, then NOT NULL (no exclusive locks on prod tables).
- Index creation: `CREATE INDEX CONCURRENTLY` on Postgres.
- Composes with `void:migrations-safety` for the discipline; this pack provides the Drizzle-specific glue.

## Server Actions vs route handlers

| Use case | Layer |
|---|---|
| UI mutation triggered by a button/form | Server Action (`app/(actions)/`) |
| External system POSTs (webhook) | Route handler (`api/webhooks/`) + `withWebhookSafety` |
| Public read-only API | Route handler (`api/`) |
| Internal cron / queue job | `withCronSafety` / `withJobSafety` wrapper |

## Composition

- `void-react` — components call Server Actions, not the DB.
- `void-nextjs` — Server Actions in `app/(actions)/`, webhooks in `app/api/webhooks/`.
- `void:async-safety` — wrappers materialize this skill's principles.
- `void:security-guidance` — Zod at ingress, no PII in returned errors.
- `void:observability` — trace + Sentry on every handler.
