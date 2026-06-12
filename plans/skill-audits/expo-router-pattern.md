---
skill: expo-router-pattern
pack: harness-mobile
status: shipped
strategy: distill
target_loc: 300
audit_date: 2026-06-01
---

# Audit: harness-mobile:expo-router-pattern

**Need.** expo-router mirrors Next.js App Router by design — but devs unfamiliar reinvent React Navigation patterns. Without this skill, mobile diverges from web mental model (one of the points of a monorepo).

**Wins.** File-layout matching `(tabs)/`, `(modal)/`, `(auth)/` conventions. Per-group `_layout.tsx` examples. Typed routes via `experiments.typedRoutes`. Deep link auto-config. Modal-as-route vs modal-as-state decision (same as web).

**Loses to.** Apps using bare React Navigation. Apps without filesystem-based routing.

**Composes with.** `harness-mobile:expo-config-plugins` (`expo-router` IS a plugin). `harness-mobile:eas-build-profile` (dev profile needs developmentClient: true). `harness-nextjs:route-group-decision` (same convention web+mobile). `harness-react:state-architecture` (modal decision). `harness-react:accessibility-check` (touch targets).

**Why not in core.** Mobile routing primitive.
