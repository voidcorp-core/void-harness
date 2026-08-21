---
skill: install-prompt-ux
pack: harness-pwa
status: shipped
strategy: native
target_loc: 250
audit_date: 2026-06-01
---

# Audit: harness-pwa:install-prompt-ux

**Need.** Default browser install prompt is bad UX (opaque timing, generic UI, no recovery after dismiss). Custom install button at the right moment dramatically improves conversion. Without this skill, devs either skip install UX or implement a hostile auto-prompt.

**Wins.** beforeinstallprompt capture pattern. Engagement-signal threshold table (sessions × time × actions). Cooldown after dismiss. iOS fallback (Safari doesn't fire BIP — instructions page).

**Loses to.** Apps that won't pursue PWA install (web-only). Native-mobile-only apps (Expo handles install via stores).

**Composes with.** `harness-pwa:manifest-checklist` (installability prerequisite). `harness-pwa:service-worker-strategy` (SW registration prerequisite). `harness-react:accessibility-check` (button label, focus). `harness:observability` (track appinstalled for conversion).

**Why not in core.** PWA-specific UX pattern.
