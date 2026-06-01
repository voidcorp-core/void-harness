---
skill: ota-update-strategy
pack: void-mobile
status: shipped
strategy: distill
target_loc: 300
audit_date: 2026-06-01
---

# Audit: void-mobile:ota-update-strategy

**Need.** OTA via EAS Update is powerful but subtle — runtime versions decide whether an update applies. fingerprint vs appVersion policy is a quiet footgun. Devs either OTA native changes (silently skipped) or rebuild every time (slow).

**Wins.** Change-type table (JS-only vs rebuild). Runtime version policies with strong recommendation (fingerprint). Rollback patterns. "What CAN'T go in OTA" explicit list.

**Loses to.** Pure App Store distribution (no OTA). Apps where store submission cadence is already fast enough.

**Composes with.** `void-mobile:eas-build-profile` (channel = profile). `void-mobile:expo-config-plugins` (plugin changes invalidate runtime). `void:observability` (log updateId in Sentry). `void:async-safety` (checkForUpdateAsync timeout + fallback).

**Why not in core.** EAS/Expo-specific.
