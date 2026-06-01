# Next.js 16 App Router (`@voidcorp/pack-nextjs`)

This app runs on Next.js 16 with the App Router, React 19, and Cache Components. This module covers Next-specific layout and rendering; for React component conventions see `@voidcorp/pack-react`, for Server Actions see `@voidcorp/pack-server`, for PWA see `@voidcorp/pack-pwa`.

## Layout

```
apps/<app>/src/
├── app/                          # App Router
│   ├── (api|actions)/            # Route handlers + Server Actions (see void-server)
│   ├── (marketing)/              # Marketing routes (public)
│   ├── (app)/                    # Authenticated routes
│   └── api/webhooks/<src>/       # Webhook handlers (see void-server)
├── components/                   # Pure UI (see void-react)
├── services/                     # Domain + use-cases (pure-by-default)
├── adapters/                     # Port implementations
├── domain/                       # Aggregates + value objects
└── infrastructure/               # instrumentation.ts, Sentry init, raw infra
```

## Route groups

- `(api|actions)`: every file is a trust boundary — composes with `void-server:server-action`.
- `(marketing)`: public, statically rendered by default, no auth.
- `(app)`: authenticated, requires middleware gate.
- `api/webhooks/<source>`: webhook handlers, always use `withWebhookSafety`.

## Cache Components (Next 16)

- Cache by default; opt out with `'use no cache'` per fetch / per component for dynamic data.
- Cache keys include user / org scope where appropriate. Never cache user-specific content under a shared key (composes with `void:security-guidance` PII).
- Use `revalidatePath('/specific-path')` after mutations — never broad `revalidatePath('/')` which kills cache hit rate.

## instrumentation.ts

- Initialize Sentry here (server + edge runtimes), pino logger, OpenTelemetry exporter.
- Anonymize user scope: `Sentry.setUser({ id: hash(userId) })`, never raw IDs.

## Composition

- `void-react` — `components/` is pure UI, no DB.
- `void-server` — `(actions)/` and `api/webhooks/` are trust boundaries.
- `void-pwa` — manifest, service worker, offline patterns.
- `void:hexagonal-architecture` — `components → services → adapters → infrastructure` direction.
- `void:observability` — Sentry + pino wired in instrumentation.ts.
