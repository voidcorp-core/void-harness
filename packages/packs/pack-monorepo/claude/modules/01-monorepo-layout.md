# Monorepo layout (`@voidcorp/pack-monorepo`)

This repository is a Turborepo + Bun workspace following the void-harness `pack-monorepo` conventions.

## Topology

```
<repo>/
├── apps/
│   └── <app>/                       # Next.js, CLI, or worker apps
│       ├── src/
│       └── package.json
├── packages/                        # Tier 1: always-on workspace packages
│   ├── core/                        # @repo/core   — logger, env, errors, Result, Option, pipe
│   ├── auth/                        # @repo/auth   — Better-Auth wrapper, RBAC, action factories
│   ├── db/                          # @repo/db     — Drizzle schema + getDb()
│   ├── ui/                          # @repo/ui     — Radix-backed primitives, ThemeProvider
│   └── config/                      # @repo/config — shared tsconfig, biome, vitest base
├── _modules/                        # Tier 2: opt-in, build-time activation via env vars
└── tooling/                         # repo-wide scripts
```

The split between `packages/` and `_modules/` is the load-bearing boundary: tier 1 is always installed and built, tier 2 activates at build time via env var presence.

## `@repo/*` package boundaries

| Package | Imports allowed | Imports forbidden |
|---|---|---|
| `@repo/core` | nothing internal | any other `@repo/*` |
| `@repo/auth` | `@repo/core` | `@repo/db` (auth defines its own port) |
| `@repo/db` | `@repo/core` | `@repo/auth` |
| `@repo/ui` | `@repo/core` | `@repo/db`, `@repo/auth` |
| `apps/*` | any `@repo/*` | any other `apps/*` |

The `boundary-direction-check` hook enforces these via tsconfig `paths` plus grep checks. Composes with the `hexagonal-architecture` skill: domain (`apps/*/src/domain/`, `apps/*/src/services/`) MUST NOT import from `apps/*/src/infrastructure/` or framework runtime modules.

## Service layout (`5+5` per service package)

```
packages/<name>/src/
  <name>.service.ts          # domain logic (always present)
  <name>.repository.ts       # DB / external I/O (always present)
  <name>.helper.ts           # pure functions (always present)
  <name>.types.ts            # Zod schemas + inferred TS types (always present)
  index.ts                   # public barrel (always present)
```

Composes with `hexagonal-architecture` (ports + adapters), `domain-driven-design` (named per aggregate), `functional` (helpers are pure).

## Hard rules

- Match file naming exactly (`Name.tsx`, `Name.helper.ts`, `Name.test.ts`).
- Service layer NEVER touches DB directly — always through repository.
- Component layer NEVER touches DB — always through service.
- Helpers are PURE: no I/O, no side effects.
- Use `@repo/core/logger`, never `console.log` in committed code.
- Use `@repo/core/env`, never `process.env` directly in business code.
- Use typed errors from `@repo/core/errors`, never throw strings.
- Server Actions live in `apps/<app>/src/actions/`, NEVER in packages.
- No em dashes, no emojis in code / docs / commits.

## Composition with void-harness skills

- **`hexagonal-architecture`** — port direction + adapter thinness enforced via the layout.
- **`tdd`** — paths default to `apps/*/src/**` business code; spikes in `apps/*/scripts/spike-*`.
- **`migrations-safety`** — migration files at `apps/*/db/migrations/` (Drizzle convention).
- **`observability`** — `@repo/core/logger` is the only logger; structured logs by default.
- **`async-safety`** — retry / idempotency / dead-letter discipline applied to webhooks, jobs, crons. Concrete patterns in `void-server:webhook-handler-pattern` and `void-server:background-job-pattern`.
