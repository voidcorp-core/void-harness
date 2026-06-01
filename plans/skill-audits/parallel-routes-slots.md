---
skill: parallel-routes-slots
pack: void-nextjs
status: shipped
strategy: distill
target_loc: 250
audit_date: 2026-06-01
---

# Audit: void-nextjs:parallel-routes-slots

**Need.** `@slot` and `(.)foo` are Next features that solve real problems (independent navigation, deep-linkable modals) but are easy to over-apply. Dev sees the feature, tries to use it for transient modals → architecture grows complex for no UX gain.

**Wins.** Clear "WIN vs LOSE" sections. Distinction between route groups (group folder `(name)`) and parallel routes (slot folder `@name`) and intercepting routes (`(.)foo`). Default-page-per-slot trap surfaced.

**Loses to.** Transient modals (useState + Radix Dialog). Mobile-first apps where slots collapse to stack. Non-route modals (delete confirm).

**Composes with.** `void-nextjs:route-group-decision` (slots live inside groups). `void-nextjs:cache-component-pattern` (each slot has cache scope). `void-nextjs:loading-error-boundaries` (per-slot loading.tsx). `void-react:state-architecture` (when to use state vs route for modals).

**Why not in core.** Next-specific routing primitives.
