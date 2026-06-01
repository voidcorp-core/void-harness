---
name: server-action
description: Create a Next.js 16 Server Action with the void-harness trust-boundary checklist (Zod ingress, auth, rate limit, observability, structured errors). Composes with security-guidance, async-safety, observability.
---

# server-action

Use when adding any `'use server'` function in a Next.js 16 app following the void-harness `pack-nextjs-pwa` conventions. Server Actions cross a trust boundary — the input came from a browser. Treat them like HTTP handlers, not like internal function calls.

If the function is **not** marked `'use server'` (it's a normal service function in `src/services/`), use `void:tdd` directly and skip this skill.

## When this skill triggers

- "Add a Server Action for X"
- "Create the action that handles the contact form"
- "Wire this button to a mutation"
- Any new file or function exporting `'use server'`

## Location (mandatory)

```
apps/<app>/src/
├── actions/<feature>/<verb>.ts          # preferred: typed Server Actions
└── app/<route>/_actions.ts              # only if tightly coupled to one route
```

Server Actions **never** live inside `packages/`. Packages own services (pure-by-default); apps own actions (the trust boundary).

## The five non-negotiable layers (in order)

Every Server Action goes through these layers, top to bottom, **always**:

```
1. Auth          — defineAction or defineFormAction from @repo/auth
2. Zod ingress   — schema validates the input object (no untyped formData)
3. Rate limit    — per-user or per-IP via @repo/auth
4. Observability — withTraceContext + Sentry user scope (anonymized)
5. Service call  — pure domain logic in src/services/<feature>/
```

Skipping any of these is a security or operability bug. There are no "internal" Server Actions — anything `'use server'` is reachable from the public internet via a forged request.

## Canonical skeleton

```ts
// apps/web/src/actions/billing/cancel-subscription.ts
'use server';

import { z } from 'zod';
import { defineAction } from '@repo/auth';
import { logger } from '@repo/core/logger';
import { cancelSubscription as cancelSubscriptionService } from '@/services/billing/cancel';
import { Result } from '@repo/core';

const Input = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.string().min(1).max(500).optional(),
});

export const cancelSubscription = defineAction({
  name: 'billing.cancelSubscription',
  auth: 'required',                                   // 1. Auth
  input: Input,                                       // 2. Zod ingress
  rateLimit: { window: '1 min', max: 5 },             // 3. Rate limit
  handler: async ({ input, user, trace }) => {        // 4. Observability via trace
    logger.info({ trace, userId: user.id, action: 'billing.cancelSubscription' }, 'start');

    const result = await cancelSubscriptionService({  // 5. Service call (pure)
      subscriptionId: input.subscriptionId,
      userId: user.id,
      reason: input.reason,
    });

    if (Result.isErr(result)) {
      logger.warn({ trace, error: result.error }, 'cancelSubscription failed');
      return { ok: false as const, error: result.error.code };
    }
    return { ok: true as const, data: result.value };
  },
});
```

## Return type discipline

Server Actions return a **discriminated union**, never throw to the client:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };       // error is a stable, human-readable code
```

- ✗ Don't return raw domain objects — they leak schema. Pick a DTO.
- ✗ Don't `throw new Error('...')` — Next swallows the message and the client sees a 500 with no actionable info. Use the Result type.
- ✗ Don't return Date or BigInt — they don't serialize across the action boundary. Convert in the handler.

## Forbidden

- `db.query(...)` directly in the action — call a service. The service calls a repository.
- `process.env.STRIPE_KEY` — use `@repo/core/env`.
- Inline `fetch('https://external/...')` — go through an adapter behind a port.
- `revalidatePath('/')` without scope — pass the specific path you mutated; broad revalidation kills cache hit rate.
- `redirect('...')` from inside a `try/catch` — Next.js `redirect()` throws on purpose; catching it breaks navigation.

## Forms vs. typed actions

Two flavors, pick by use case:

| Use | Wrapper | Input |
|---|---|---|
| Submit-on-click button / typed payload | `defineAction` | Object (Zod object schema) |
| HTML form with `<form action={action}>` | `defineFormAction` | FormData (Zod transforms entries) |

`defineFormAction` parses `FormData` for you — never reach into FormData manually with `.get()` casts.

## Workflow

1. **Define the service first**, in `src/services/<feature>/<verb>.ts`. Pure-by-default; deps injected; tested in strict TDD mode.
2. **Write the Zod input schema** in the action file. Aim for the smallest possible surface; reject unknown keys.
3. **Pick the wrapper**: `defineAction` for typed inputs, `defineFormAction` for HTML forms.
4. **Decide auth posture**: `'required'` (logged-in user), `'optional'` (passes user if present), `'public'` (no user) — `'public'` requires explicit justification in a comment.
5. **Set the rate limit**. Default to per-user 30/min for mutations, 100/min for reads. Stricter on auth-adjacent actions (password reset: 3/hour).
6. **Wire trace + Sentry scope** via the handler context (the wrapper does this for you when used correctly).
7. **Write the action test** in `<verb>.test.ts` next to the action — assert auth, validation, rate limit, and happy path. Service tests already cover the domain.

## Composition

- `void:security-guidance` — Zod at every ingress; sensitive data redacted from logs; no PII in error messages returned to client.
- `void:async-safety` — for webhooks (which look like actions but are POST endpoints), use `withWebhookSafety` from `@voidcorp/pack-nextjs-pwa` instead.
- `void:observability` — `withTraceContext` propagates trace ID; Sentry user scope uses `hash(userId)`, never the raw ID.
- `void:tdd` — souple mode on the action (boundary), strict on the underlying service. Auth/validation are tested at the action layer.
- `void-monorepo:service-package` — when the service grows enough to deserve its own package, extract it (rare, but the path is there).
