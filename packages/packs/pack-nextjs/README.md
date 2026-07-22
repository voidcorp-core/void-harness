# `@voidcorp/pack-nextjs`

Next.js 16 conventions for the [void-harness](https://github.com/voidcorp-core/void-harness). Marketplace plugin name: `harness-nextjs`.

## Two delivery channels

This pack ships through two channels, and it matters which artifact carries what:

- **npm package `@voidcorp/pack-nextjs`** — runtime code you `import`. The
  published tarball contains `dist/` (the async wrappers) and `claude/modules/`
  (CLAUDE.md / AGENTS.md fragments). It does NOT contain skills or hooks.
- **Marketplace plugin `harness-nextjs`** — the Claude Code / Codex plugin. Skills
  (`skills/`), hooks (`hooks/`) and the plugin manifest (`.claude-plugin/`) are
  delivered here, via the GitHub marketplace, not via npm.

## What this pack provides

### Async safety wrappers (`@voidcorp/pack-nextjs/async`) — npm

Composes with the `async-safety` skill — the canonical verify, dedup, handle, mark pattern.

- **`withWebhookSafety`** — wrap a webhook handler with signature verification, idempotency-key dedup, structured outcome. Order enforced by the wrapper; business handler stays pure.
- **`withJobSafety`** _(Phase E follow-up)_ — same shape for background jobs (BullMQ / Inngest / Trigger.dev / Vercel Cron).
- **`withCronSafety`** _(Phase E follow-up)_ — Postgres advisory-lock-based overlap protection.

### UI primitives (`@voidcorp/pack-nextjs/ui`) — npm

_(Phase E follow-up)_ — shadcn/Radix-based `@repo/ui` components composing with the `accessibility-first` and `frontend-design` skills (mobile-first dual-quality tokens, Tappable helper, Sentry breadcrumbs, axe-core integration, palette tokens with documented WCAG AA contrast).

### CLAUDE.md / Codex modules (`@voidcorp/pack-nextjs/claude/modules`) — npm

CLAUDE.md / AGENTS.md fragments for Next 16 / RSC / Server Actions / Cache Components conventions. The CLI wires these into the consumer's CLAUDE.md / AGENTS.md.

### Skills and hooks — marketplace plugin only

Pack-specific skills (extending core skills with Next.js context) and hooks (e.g. axe-precommit) ship with the `harness-nextjs` plugin from the marketplace. They are not in the npm tarball.

## Install

```bash
# Via the void-harness CLI (accepts pack-nextjs, harness-nextjs, or nextjs)
npx @voidfactory/harness init --pack pack-monorepo --pack pack-nextjs
```

The CLI enables both plugins and wires their Claude / Codex modules into the consumer's CLAUDE.md / AGENTS.md.

## Direct consumer usage

```typescript
// apps/web/src/app/api/webhooks/stripe/route.ts
import { withWebhookSafety } from '@voidcorp/pack-nextjs/async';

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
