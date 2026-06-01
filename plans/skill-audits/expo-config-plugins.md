---
skill: expo-config-plugins
pack: void-mobile
status: shipped
strategy: distill
target_loc: 250
audit_date: 2026-06-01
---

# Audit: void-mobile:expo-config-plugins

**Need.** "I need native functionality" → devs default to ejecting → one-way door. The Expo way (config plugin OR Expo Module) covers 95% of needs. Without this skill, projects drift to bare RN and lose Expo's tooling benefits.

**Wins.** Decision tree (Expo module → community plugin → custom config plugin → Expo Module → eject). Common-modules table (camera, haptics, secure-store, ...). Custom-plugin pattern with concrete example. `app.config.ts` vs `app.json` decision.

**Loses to.** Pure native apps (Swift/Kotlin from scratch). Apps that already ejected (different debug surface).

**Composes with.** `void-mobile:eas-build-profile` (plugins define what's IN, profiles define HOW to build). `void-mobile:ota-update-strategy` (plugin changes break OTA — runtime fingerprint shift). `void-react:state-architecture` (JS state shared with web). `void-server:env-validation` (env via `extra` validated).

**Why not in core.** Mobile-specific (Expo/RN). Web has no equivalent concept.
