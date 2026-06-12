---
skill: cache-component-pattern
pack: harness-nextjs
status: shipped
strategy: distill
target_loc: 300
audit_date: 2026-06-01
---

# Audit: harness-nextjs:cache-component-pattern

**Need.** Next 16 inverts the cache default (now cached-by-default). Most devs muscle-memory the Next 13/14 pattern (explicit cache opt-in) and ship over-dynamic. Worse: caching user-scoped content under a route-only key = security leak. The skill codifies "opt out explicitly when user-dependent" + the "shared cache across users" trap.

**Wins.** Clear cache key derivation rules. Belt-and-braces "always 'use no cache' on user content even if Next would detect it". `revalidateTag` vs `revalidatePath` decision table.

**Loses to.** Non-Next frameworks (Vite, Remix). Next 13/14 (different cache model).

**Composes with.** `harness-react:client-vs-server-component` (only Server Components participate). `harness-server:server-action` (revalidateTag from mutations). `harness:security-guidance` (cache-key-leak as security control). `harness:observability` (cache miss as perf signal).

**Why not in core.** Cache Components is Next 16-specific. Generic caching principles (cache key, invalidation, TTL) are framework-neutral and live elsewhere.
