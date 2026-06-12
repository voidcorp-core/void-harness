---
skill: manifest-checklist
pack: harness-pwa
status: shipped
strategy: native
target_loc: 250
audit_date: 2026-06-01
---

# Audit: harness-pwa:manifest-checklist

**Need.** Manifests fail silently — installability gone with no error visible to dev. Maskable icon trap, name vs short_name confusion, missing fields all cause "install prompt never appears". This skill ships a field-by-field checklist with the WHY for each.

**Wins.** Concrete JSON template. Field-by-field with motivation. Anti-pattern list catches the 6 common failures. Optional-fields-worth-adding section (categories, screenshots, shortcuts).

**Loses to.** Non-PWA web apps (no install goal). Mobile apps (different manifests — Expo handles).

**Composes with.** `harness-pwa:install-prompt-ux` (installability requires valid manifest). `harness-pwa:service-worker-strategy` (manifest + SW = installable). `harness-react:accessibility-check` (lang + dir are a11y signals). `harness:frontend-design` (theme_color + icon design).

**Why not in core.** PWA-specific artifact.
