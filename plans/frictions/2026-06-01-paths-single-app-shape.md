---
date: 2026-06-01
source: solaar (init on Next.js + Expo monorepo)
kind: architectural-friction
severity: major
status: proposed
---

# `DEFAULT_CONFIG.paths` is single-app-shaped, breaks on mixed-stack monorepos

## What I saw

Solaar has `apps/web` (Next.js) and `apps/mobile` (Expo). After `init`:

```json
"paths": {
  "business":      "apps/*/src/**",
  "tests":         "apps/*/src/**/*.test.{ts,tsx}",
  "serverActions": "apps/*/src/app/(api|actions)/**"
}
```

The `serverActions` glob targets `apps/<app>/src/app/(api|actions)/**` — that's Next.js App Router shape. But it would match `apps/mobile/src/app/` if Expo's expo-router ever has an `(actions)` group, producing a false-positive trust-boundary check.

More broadly: the same `paths.business` covers `apps/mobile/src/` (React Native code) and `apps/web/src/` (Next.js code). The TDD modes can't distinguish "this is mobile, different rules apply" from path alone.

## What would unblock me

Two options, no clear winner yet:

**A) Per-app config**: paths becomes an array of `{ app: 'web', paths: {…} }` blocks. Skills/hooks resolve which block applies via the file's leading path segment.

**B) Per-app `.void/config.json`**: each app gets its own `apps/<app>/.void/config.json`, root one becomes minimal. Skills walk up to find the nearest config (like ESLint).

A is simpler to implement but ties consumer to a flatter mental model; B mirrors how most monorepo tools work (per-package config). Lean B.

## Why this matters

The capability-first plugin split assumes consumers compose packs to match their stack — but a Next+Expo monorepo wants `harness-nextjs` rules ONLY in `apps/web/` and `harness-mobile` rules ONLY in `apps/mobile/`. Without per-app paths, both rule sets fire on both apps and the consumer has to choose: ignore false-positives (erodes trust) or scope manually (defeats the harness).

## Decision

Defer concrete change until at least one more multi-app consumer hits this. Could be addressed in a `0.4.0` minor as it's additive (per-app overrides while keeping single-app defaults working).
