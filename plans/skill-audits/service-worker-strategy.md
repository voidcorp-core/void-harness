---
skill: service-worker-strategy
pack: harness-pwa
status: shipped
strategy: distill
target_loc: 300
audit_date: 2026-06-01
---

# Audit: harness-pwa:service-worker-strategy

**Need.** Service worker caching strategy is rediscovered badly per project. Wrong strategy = stale HTML after deploy, missing offline, infinite spinner. Cache versioning omitted = orphan caches growing forever. This skill ships the canonical per-resource-class strategy table + Serwist config.

**Wins.** Strategy-per-resource table (HTML, JS, fonts, images, API). Cache versioning rule with the orphan cleanup callout. Update activation patterns (silent / prompt / aggressive). Debug section using DevTools concretely.

**Loses to.** Apps without offline requirements (skip SW entirely). Apps where Vercel/CDN edge caching is sufficient (no PWA install goal).

**Composes with.** `harness-pwa:manifest-checklist` (SW + manifest = installable). `harness-pwa:install-prompt-ux` (SW registered first). `harness-pwa:offline-first-mutation` (capture-queue handles mutations; SW handles GET caching). `harness-nextjs:cache-component-pattern` (server cache vs SW cache layers).

**Why not in core.** PWA-specific machinery.
