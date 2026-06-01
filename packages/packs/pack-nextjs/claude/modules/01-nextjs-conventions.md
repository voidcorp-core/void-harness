# Next.js 16 conventions (`@voidcorp/pack-nextjs-pwa`)

This app runs on Next.js 16 with the App Router, React 19, and Cache Components.

## Layout

```
apps/<app>/src/
├── app/                          # App Router
│   ├── (api|actions)/            # Route handlers + Server Actions (trust boundary)
│   ├── (marketing)/              # Marketing routes (public)
│   ├── (app)/                    # Authenticated routes
│   └── api/webhooks/<src>/       # Webhook handlers using withWebhookSafety
├── components/                   # Pure UI (no DB, no fetch)
├── services/                     # Domain + use-cases (pure-by-default, deps-injected)
├── adapters/                     # Port implementations (Drizzle, Stripe SDK, Resend, etc.)
├── domain/                       # Aggregates + value objects + domain events
└── infrastructure/               # Raw infra (Drizzle config, Sentry init, etc.)
```

## Trust boundaries

Every Server Action / route handler / webhook handler is a trust boundary. Apply at every one:

- **Zod validation** at ingress (composes with `security-guidance`)
- **withWebhookSafety** for inbound webhooks (composes with `async-safety`)
- **withTraceContext** wrapper for trace ID propagation (composes with `observability`)
- **Anonymized user scope** for Sentry (`Sentry.setUser({ id: hash(userId) })`)

## Server Actions

- Live in `apps/<app>/src/app/(actions)/<feature>/` or `apps/<app>/src/actions/<feature>/`.
- Use `defineAction` or `defineFormAction` from `@repo/auth` (provided by `pack-monorepo` auth integration).
- Server Actions are pack-wide convention: never define them inside packages — only in apps.
- Composes with `tdd` souple mode (handler) + strict mode (underlying service).

## Cache Components (Next 16)

- Cache by default; opt out with `'use no cache'` per fetch / per component for dynamic data.
- Cache keys include user / org scope where appropriate (do NOT cache user-specific content under a shared key — composes with `security-guidance` PII).

## PWA

- `public/manifest.webmanifest` + service worker via `next-pwa` _(Phase E follow-up: pick the SW library)_.
- Offline-first patterns documented per app (composes with the consumer's `voidcorp.config.json`).
- Mobile-first dual-quality (composes with `frontend-design` + `accessibility-first`).

## Forbidden in `components/`

- `import { db } from '@/...'` — components MUST NOT touch the DB. Call a service.
- Inline `fetch` to external APIs — go through an adapter behind a port.
- `process.env.*` — use `@repo/core/env`.

## Composition with void-harness skills

- **`hexagonal-architecture`** — `components/` → `services/` → `adapters/` → `infrastructure/`. Strict direction.
- **`frontend-design`** + **`accessibility-first`** — `components/` from `@repo/ui` (shadcn/Radix). Mobile-first dual-quality.
- **`async-safety`** — `app/api/webhooks/*/route.ts` always uses `withWebhookSafety`.
- **`observability`** — Sentry initialized in `instrumentation.ts`; pino logger via `@repo/core/logger`.
- **`security-guidance`** — Zod at every trust boundary; secrets via `env`; no `dangerouslySetInnerHTML` without allowlist.
- **`llm-cost-discipline`** — LLM SDK in `adapters/llm/`; cost-discipline rules apply at every call site.
