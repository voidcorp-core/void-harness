# `@voidcorp/pack-nextjs-pwa`

Next.js 16 + PWA conventions for the [void-harness](https://github.com/voidcorp-core/void-harness).

## What this pack provides

### Async safety wrappers (`@voidcorp/pack-nextjs-pwa/async`)

Composes with the `async-safety` skill — the canonical verify → dedup → handle → mark pattern.

- **`withWebhookSafety`** — wrap a webhook handler with signature verification, idempotency-key dedup, structured outcome. Order enforced by the wrapper; business handler stays pure.
- **`withJobSafety`** _(Phase E follow-up)_ — same shape for background jobs (BullMQ / Inngest / Trigger.dev / Vercel Cron).
- **`withCronSafety`** _(Phase E follow-up)_ — Postgres advisory-lock-based overlap protection.

### UI primitives (`@voidcorp/pack-nextjs-pwa/ui`)

_(Phase E follow-up)_ — shadcn/Radix-based `@repo/ui` components composing with the `accessibility-first` and `frontend-design` skills (mobile-first dual-quality tokens, Tappable helper, Sentry breadcrumbs, axe-core integration, palette tokens with documented WCAG AA contrast).

### Claude / Codex modules (`@voidcorp/pack-nextjs-pwa/claude/*`)

- **`modules/`** — CLAUDE.md / AGENTS.md fragments for Next 16 / RSC / Server Actions / Cache Components conventions.
- **`skills/`** — pack-specific skills extending core skills with Next.js context.
- **`hooks/`** — pack-installed hooks (e.g. axe-precommit).

## Install

```bash
# Via the void-harness CLI
npx @voidcorp/harness init --pack pack-monorepo --pack pack-nextjs-pwa
```

The CLI installs both packs and wires their Claude / Codex modules into the consumer's CLAUDE.md / AGENTS.md.

## Direct consumer usage

```typescript
// apps/web/src/app/api/webhooks/stripe/route.ts
import { withWebhookSafety } from '@voidcorp/pack-nextjs-pwa/async';

const stripeWebhookHandler = withWebhookSafety({
  verify: async (req) => verifyStripeSignature(req, env.STRIPE_WEBHOOK_SECRET),
  dedupKey: (event) => event.id,
  store: stripeIdempotencyStore,
  handler: async (event) => processStripeEvent(deps, event),
});

export async function POST(req: Request) {
  const outcome = await stripeWebhookHandler(req);
  return Response.json(outcome.body, { status: outcome.status });
}
```

## Peer dependency

`@voidcorp/pack-monorepo` (uses `Result<T, E>` + `Option<T>` + shared TS config).

## Status

MVP. `withWebhookSafety` shipped. Job / Cron wrappers, `@repo/ui`, Sentry init, Tailwind preset land in subsequent commits.

## License

MIT.
