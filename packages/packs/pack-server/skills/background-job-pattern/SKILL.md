---
name: background-job-pattern
description: Run async work outside the request lifecycle — when to use a queue (Inngest, Trigger, Cloudflare Queues) vs a cron route handler. Idempotency, retry, dead-letter. Composes with async-safety doctrine.
---

# background-job-pattern

Use when work needs to happen **outside the user's request lifecycle** — too slow for the 10s HTTP timeout, or scheduled, or needing retry. Default in void-harness: a managed queue (Inngest, Trigger.dev, Cloudflare Queues) for event-driven jobs; Next's cron route handlers for time-based.

If the work completes in < 200ms AND happens during the request anyway, do it inline. Background jobs add latency to the UX (work happens later) and infrastructure cost. Not the default.

## When to use a background job

- Sending an email after signup (don't block the signup response on SMTP)
- Generating a PDF/export (multi-second work)
- Recomputing a cache after data change
- Polling an external API on schedule
- Cleanup tasks (delete soft-deleted rows after 30 days)
- Webhook retries when initial handler fails recoverably

## When NOT to use a background job

- Work that the user is actively waiting for (use Server Actions, await inline)
- Work that depends on per-request context (cookies, headers) the queue won't have
- Sub-100ms operations (queue overhead > work cost)
- One-off scripts (use a runbook, not a job)

## Three job types

| Type | Trigger | Tool | Wrapper |
|---|---|---|---|
| **Event-driven** | Code event ("user.signed_up") | Inngest / Trigger / Queue | `withJobSafety` |
| **Scheduled** | Cron expression | Vercel Cron / Inngest schedule | `withCronSafety` |
| **One-shot** | Manual or webhook | Same as event-driven | `withJobSafety` |

Pick the right type by **the trigger**, not by the work.

## Event-driven jobs (Inngest pattern)

```ts
// apps/web/src/jobs/send-welcome-email.ts
import { inngest } from '@/adapters/inngest';
import { withJobSafety } from '@voidcorp/pack-server';
import { z } from 'zod';
import { emailService } from '@/services/email';

const Event = z.object({
  data: z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
  }),
});

export const sendWelcomeEmail = inngest.createFunction(
  { id: 'send-welcome-email', retries: 3 },
  { event: 'user.signed_up' },
  withJobSafety({
    schema: Event,
    handler: async ({ event, log }) => {
      log.info({ event: 'job.start', name: 'send-welcome-email', userId: event.data.userId });
      await emailService.sendWelcome({ to: event.data.email });
      return { ok: true };
    },
  }),
);
```

Trigger from a Server Action:

```ts
// after creating the user
await inngest.send({ name: 'user.signed_up', data: { userId, email } });
```

`withJobSafety` wraps:

- Zod re-validation of event payload (defense in depth)
- Idempotency key (default: `inngest.eventId`)
- Trace context (Sentry breadcrumb, OTel span)
- Logger with job name + event ID
- Permanent-failure detection (don't retry validation errors)

## Scheduled jobs (cron)

```ts
// apps/web/src/app/api/cron/cleanup/route.ts
import { withCronSafety } from '@voidcorp/pack-server';
import { cleanupSoftDeleted } from '@/services/admin';

export const GET = withCronSafety({
  schedule: '0 3 * * *',   // 3 AM UTC daily
  auth: 'cron-secret',     // verifies CRON_SECRET header
  handler: async ({ log }) => {
    log.info({ event: 'cron.start', name: 'cleanup' });
    const result = await cleanupSoftDeleted({ olderThanDays: 30 });
    log.info({ event: 'cron.done', name: 'cleanup', deleted: result.count });
    return { ok: true };
  },
});
```

`withCronSafety` wraps:

- Cron secret verification (`Authorization: Bearer ${CRON_SECRET}`) — blocks unauthorized invocations
- Concurrency lock (skip if previous run still in-flight; prevents pile-up)
- Trace context + logger
- Dead-letter on permanent failure (alert, don't silently skip next run)

Vercel Cron config (`vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }
  ]
}
```

## Idempotency

Every job MUST be idempotent — same event delivered twice = one effect:

- **Use the event ID as a deduplication key** in an inbox table (same pattern as webhooks).
- **Or design the work itself to be idempotent**: `INSERT ON CONFLICT DO NOTHING`, `UPDATE WHERE state = 'pending'`.

If neither is feasible, you have a job that's unsafe to retry — flag it, write an ADR, and design around it.

## Retry policy

Most queue systems retry on throwing handlers. Tune:

- **Retry count**: 3-5 for transient failures (network, 5xx from external API)
- **Backoff**: exponential, capped (Inngest default is fine: 2^n minutes up to 4 hours)
- **No retry for**: validation errors (Zod throws), 4xx from external API (not our fault, won't fix on retry)

`withJobSafety` distinguishes these — throw `NonRetryableError` to bypass retry.

## Dead-letter

After retry budget exhausted:

- Job goes to DLQ (queue's own DLQ or a custom `job_dead_letter` table)
- Surface in `Settings → Background jobs → Dead letter`
- Team reviews, replays, or discards

Never silently drop a failed job. The work was intended; failure mode must be visible.

## Anti-patterns

- ✗ **`fire-and-forget` from a Server Action without a queue** — `Promise.resolve().then(work)` doesn't wait; serverless instance shuts down with the request
- ✗ **One mega-job that does 10 things** — split per concern; one job per event type
- ✗ **Cron without concurrency lock** — slow runs pile up, take down the worker
- ✗ **No cron secret** — anyone hitting the URL triggers your cron
- ✗ **Reading per-request context** — jobs don't have the user's cookies; pass identity in the event payload
- ✗ **Logging without job name + event ID** — when something fails, you can't correlate

## Local development

- Inngest CLI runs a local worker that pipes events through a UI
- Trigger.dev has a dev mode similar
- Vercel Cron doesn't have local equivalent; mock by calling the route handler directly with the cron secret

## Composition

- `void:async-safety` — doctrine (retry, idempotency, dead-letter, timeouts). This skill is the operational form.
- `void-server:webhook-handler-pattern` — webhooks often emit events that trigger jobs.
- `void-server:server-action` — actions emit events for async followup (signup → send-welcome).
- `void-server:env-validation` — `CRON_SECRET`, queue API keys validated in `@repo/core/env`.
- `void:observability` — trace context links action → event → job in Sentry / OTel.
