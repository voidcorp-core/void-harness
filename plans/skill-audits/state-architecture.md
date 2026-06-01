---
skill: state-architecture
pack: void-react
status: shipped
strategy: native
target_loc: 250
audit_date: 2026-06-01
---

# Audit: void-react:state-architecture

**Need.** State location is the #1 architectural drift in React apps. Defaults are wrong (useState at page root for filters, Context for high-frequency state, Zustand for what should be URL). The decision tree gives the highest-tier-that-works approach.

**Wins.** Strict tier order (URL > server > local > lifted > Zustand > React Query). Anti-patterns explicit. "Single-field form" hand-off to form-pattern skill avoids overlap.

**Loses to.** Form state (handled by form-pattern). Offline-write state (handled by offline-first-mutation in void-pwa).

**Composes with.** `void-react:client-vs-server-component` (server state = server component). `void-react:form-pattern` (forms = local state via react-hook-form). `void-pwa:offline-first-mutation` (capture-queue is a specialized client store for sync). `void-nextjs:cache-component-pattern` (server cache strategy).

**Why not in core.** State tooling is React-specific (Zustand, Jotai, React Query). Other UI stacks have different patterns (Svelte stores, Solid signals).
