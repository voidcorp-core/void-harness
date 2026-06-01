---
skill: expo-router-pattern
pack: void-mobile
status: shipped
strategy: distill
target_loc: 300
audit_date: 2026-06-01
---

# Audit: void-mobile:expo-router-pattern

**Need.** expo-router mirrors Next.js App Router by design — but devs unfamiliar reinvent React Navigation patterns. Without this skill, mobile diverges from web mental model (one of the points of a monorepo).

**Wins.** File-layout matching `(tabs)/`, `(modal)/`, `(auth)/` conventions. Per-group `_layout.tsx` examples. Typed routes via `experiments.typedRoutes`. Deep link auto-config. Modal-as-route vs modal-as-state decision (same as web).

**Loses to.** Apps using bare React Navigation. Apps without filesystem-based routing.

**Composes with.** `void-mobile:expo-config-plugins` (`expo-router` IS a plugin). `void-mobile:eas-build-profile` (dev profile needs developmentClient: true). `void-nextjs:route-group-decision` (same convention web+mobile). `void-react:state-architecture` (modal decision). `void-react:accessibility-check` (touch targets).

**Why not in core.** Mobile routing primitive.
