---
skill: eas-build-profile
pack: harness-mobile
status: shipped
strategy: distill
target_loc: 250
audit_date: 2026-06-01
---

# Audit: harness-mobile:eas-build-profile

**Need.** eas.json's 3-profile convention (development/preview/production) is documented by Expo but the WHY of each option is scattered. Devs copy a stale template, miss `autoIncrement`, leak secrets via env. This skill ships the void-harness convention + per-option motivation.

**Wins.** 3-profile JSON template. Plain-words explanation per profile. Env per profile = APP_VARIANT pattern (3 variants installable side-by-side). Secrets via `eas secret`, NEVER eas.json env. Submit config callout.

**Loses to.** Bare RN projects (no EAS). One-profile internal-only apps (waste of overhead).

**Composes with.** `harness-mobile:expo-config-plugins` (plugins build with the profile). `harness-mobile:ota-update-strategy` (channel names = profile names). `harness-mobile:expo-router-pattern` (dev profile needs developmentClient). `harness-server:env-validation` (runtime env via `extra` validated).

**Why not in core.** EAS-specific build pipeline.
