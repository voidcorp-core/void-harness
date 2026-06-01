---
skill: client-vs-server-component
pack: void-react
status: shipped
strategy: native
target_loc: 250
audit_date: 2026-06-01
---

# Audit: void-react:client-vs-server-component

**Need.** "Type 'use client' if interactive" is the lazy heuristic that ships 80% of the app to the browser. Without explicit guidance, devs default-mark client; the JS payload bloats; SSR benefits evaporate. This skill codifies "server by default; client at the leaf".

**Wins.** Concrete table (state type → location → component type). Anti-pattern list catches the common 5. Performance signal ("JS payload > 100KB = too much client") gives a measurable check.

**Loses to.** Non-RSC frameworks (pure Vite SPA, Remix Run pre-RSC). Forms — handled by form-pattern skill.

**Composes with.** `void-nextjs:cache-component-pattern` (Server Components are the cache substrate). `void-react:state-architecture` (where client state lives once you've decided client). `void-react:form-pattern` (Server Actions on Server-rendered forms). `void:hexagonal-architecture` (Server Components ARE the boundary).

**Why not in core.** Server Components are a React 19 / Next 14+ specific construct. Single-app Vite or non-RSC tools don't have this decision.
