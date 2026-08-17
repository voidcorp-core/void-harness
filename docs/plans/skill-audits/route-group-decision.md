---
skill: route-group-decision
pack: harness-nextjs
status: shipped
strategy: native
target_loc: 200
audit_date: 2026-06-01
---

# Audit: harness-nextjs:route-group-decision

**Need.** Route groups `(name)` are powerful but undocumented in real conventions. Devs sprinkle them per feature (`(billing)`, `(dashboard)`) creating one-route groups + layout proliferation. The void-harness convention groups by trust boundary, not visual section.

**Wins.** 3-condition gate before adding a group (distinct layout + distinct trust posture + ≥2 routes). Explicit naming convention (no `(misc)`). Confusion-prevention note distinguishing groups from parallel/intercepting routes.

**Loses to.** Single-route apps. Apps not on App Router (Pages router has no concept of groups).

**Composes with.** `harness-nextjs:cache-component-pattern` (`(marketing)` cached, `(app)` mostly dynamic). `harness-server:server-action` (`(actions)/` location). `harness-monorepo:adr-workflow` (group additions are ADR-worthy). `harness:security-guidance` (auth in `(app)/layout.tsx`).

**Why not in core.** App Router routing is Next-specific.
