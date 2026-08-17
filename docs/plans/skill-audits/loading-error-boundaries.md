---
skill: loading-error-boundaries
pack: harness-nextjs
status: shipped
strategy: distill
target_loc: 250
audit_date: 2026-06-01
---

# Audit: harness-nextjs:loading-error-boundaries

**Need.** `loading.tsx`/`error.tsx`/`not-found.tsx` placement is the #2 layout question after groups. One root loading.tsx = whole-app skeleton; per-route boundaries = streamed UX. Plus error boundaries forgetting Sentry capture = silent failures in prod.

**Wins.** "Place as low as practical" rule with concrete example. Skeleton design (match layout shape, not spinners). Error boundary template includes Sentry capture (avoiding the common omission).

**Loses to.** Routes with no async work (no loading needed). Pages router projects.

**Composes with.** `harness-nextjs:cache-component-pattern` (cached pages mostly skip loading.tsx). `harness-nextjs:parallel-routes-slots` (per-slot boundaries). `harness:observability` (error.tsx is the Sentry capture point). `harness-react:accessibility-check` (skeletons need aria-busy / aria-live).

**Why not in core.** Boundary file convention is App Router-specific.
