---
name: dependency-direction
kind: standard
description: Enforce the @repo/* import direction in a Turborepo workspace. Concrete violations + fixes. Composes with core:hexagonal-architecture and the boundary-direction-check hook.
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: active
    codex: active
    hermes: ci-only
eval_targets: [claude/anthropic/opus]
---

# dependency-direction

Use when adding an `import` statement that crosses a package boundary, or when fixing a `boundary-direction-check` hook violation. This skill is the **operational guide** for the rules core `hexagonal-architecture` and `boundary-direction-check` enforce mechanically.

## The rule

```
@repo/core    →   nothing internal
@repo/auth    →   @repo/core
@repo/db      →   @repo/core
@repo/ui      →   @repo/core
@repo/<feat>  →   @repo/core   (and only @repo/core)
apps/<app>    →   any @repo/*
```

**No `@repo/*` package imports another `@repo/*` except `@repo/core`.** All composition happens at the app level. If `@repo/billing` needs the user, it defines a port; the consuming app wires `@repo/auth`'s adapter into that port.

This sounds restrictive. It is. It is what keeps the monorepo from collapsing into a hairball.

## Why core is the only allowed dependency

`@repo/core` ships **primitives** with no internal deps:

- `logger` (pino)
- `env` (Zod-validated env)
- `errors` (typed error classes)
- `Result`, `Option`, `pipe` (functional utilities)

These are leaf utilities. Everything else is composition.

## Common violation: `@repo/billing` wants the user

**Wrong**:
```ts
// packages/billing/src/billing.service.ts
import { db } from '@repo/db';                  // ✗
import { getCurrentUser } from '@repo/auth';    // ✗

export async function cancelSubscription() {
  const user = await getCurrentUser();
  await db.update(subscriptions)...
}
```

**Right** — define the port in `@repo/billing`, wire the adapter in the app:

```ts
// packages/billing/src/billing.types.ts (port)
export interface BillingPorts {
  readonly userRepo: { findById(id: string): Promise<User | null> };
  readonly subscriptionRepo: { update(id: string, p: Partial<Sub>): Promise<void> };
}

// packages/billing/src/billing.service.ts (pure)
export function makeBillingService(ports: BillingPorts) {
  return {
    async cancelSubscription(userId: string) {
      const user = await ports.userRepo.findById(userId);
      // ... domain logic only
    },
  };
}

// apps/web/src/adapters/billing.ts (composition)
import { makeBillingService } from '@repo/billing';
import { db } from '@repo/db';
import { userRepo, subRepo } from '@/repositories';
export const billing = makeBillingService({ userRepo, subscriptionRepo: subRepo });
```

The app is the integration point. Packages are pure capabilities.

## Common violation: types from another package

**Wrong**:
```ts
// packages/billing/src/billing.types.ts
import type { User } from '@repo/auth';  // ✗ types still create coupling
```

**Right** — declare your own User type narrowed to what billing needs:

```ts
// packages/billing/src/billing.types.ts
export interface BillingUser {
  readonly id: string;
  readonly email: string;
  readonly orgId: string;
}
```

If `@repo/auth`'s `User` and `@repo/billing`'s `BillingUser` should be the same shape, factor the shape into `@repo/core/types`. But almost always, each package wants a narrower projection — that's good.

## Common violation: `@repo/ui` calls a service

**Wrong**:
```tsx
// packages/ui/src/UserAvatar.tsx
import { getCurrentUser } from '@repo/auth';   // ✗
export function UserAvatar() {
  const user = use(getCurrentUser());          // ✗ side effect in UI
  return <Avatar src={user.avatarUrl} />;
}
```

**Right**:
```tsx
// packages/ui/src/Avatar.tsx (dumb prop-driven)
export function Avatar({ src, fallback }: { src: string; fallback: string }) {
  return <img src={src} alt={fallback} />;
}

// apps/web/src/components/CurrentUserAvatar.tsx (binding, NOT in @repo/ui)
import { Avatar } from '@repo/ui';
import { useCurrentUser } from '@/hooks';
export function CurrentUserAvatar() {
  const user = useCurrentUser();
  return <Avatar src={user.avatarUrl} fallback={user.name} />;
}
```

`@repo/ui` exports primitives with no I/O. Bindings to actual data live in apps.

## The `apps/<app>` → `apps/<other-app>` rule

**Never** import from another app:

```ts
// apps/web/src/foo.ts
import { whatever } from '../../mobile/src/...';  // ✗ — even via @repo/* alias if you set it up
```

If two apps need the same code, that code goes in a `@repo/*` package. There is no "shared/" directory between apps.

## When you genuinely need cross-package access

You don't. Re-read the section on ports. If after that you still think you do, write an ADR (`harness-monorepo:decide`) documenting the exception with the reversal cost. 90% of "I need this" turns out to be "I forgot to define the port".

## Mechanical enforcement

The `boundary-direction-check` hook (core) blocks Edit/Write that introduces a forbidden import. Override by tagging the import line `// allow-boundary: <reason>` — but think hard first, because each exception is a small future grind.

## Workflow

1. **Before adding the import**, ask: does this cross a `@repo/*` boundary?
2. **If yes**, ask: is the destination `@repo/core`? OK. Anything else? Stop.
3. **Define a port** in your package, wire the adapter in the app.
4. **If the hook complains**, do not tag-and-move-on. Refactor.

## Composition

- `harness:hexagonal-architecture` — doctrine on ports + adapters direction (core).
- `boundary-direction-check` hook (core) — mechanical gate.
- `harness-monorepo:package-extraction` — most boundary problems come from premature extraction.
- `harness-monorepo:service-package` — the 5+5 layout includes a `<name>.types.ts` precisely for owning your own types.
