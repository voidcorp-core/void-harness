---
schemaVersion: 1
id: "adr:6b9445b8-0a91-4a7b-8191-71c77c206efd"
createdAt: "2026-09-09T16:54:40.332Z"
title: "Allow dependency lockfile maintenance without manifest churn"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Allow dependency lockfile maintenance without manifest churn

## Context

A consumer using Bun could not repair vulnerable dependencies because the session
floor prohibited lockfile edits categorically. The CI driver also required a
manifest change, although a dependency refresh can leave the manifest unchanged.
Bun's text `bun.lock` was missing from the manual-edit guard.

This replaces the policy in the legacy
[manifest-pair decision](2026-07-10-the-server-side-floor-allows-a-lockfile-change-accompanied-b.md).
That legacy record has no ADR identity and remains immutable.

## Decision

For requested dependency operations, permit package-manager lockfile regeneration
with or without manifest changes; keep direct edits blocked, including `bun.lock`
and `bun.lockb`, and let CI scan the committed text diff without pretending to
prove generation from the presence of a manifest change.

## Consequences

- Security updates no longer require artificial manifest churn or an allowlist.
- CI emits a dependency-validation warning and continues text content scanning.
- Consumer CI owns frozen installation, vulnerability audit and tests; review
  owns the dependency diff. This change does not install those checks for them.
- Binary lockfiles have no textual added lines to scan. This floor does not
  certify their contents or package-manager provenance.
- Existing secret, credential and key protections remain. Autopilot's sensitive
  path merge gate remains unchanged.

## Alternatives considered

- Require a manifest change: rejected because it excludes legitimate refreshes
  and an unrelated manifest edit does not authenticate a lockfile.
- Permanently allowlist lockfiles: rejected because it skips content scanning.
- Run arbitrary consumer package managers inside the generic diff driver:
  rejected because it adds installation side effects and runtime dependencies
  to a read-only scanner. Consumer dependency jobs already own this boundary.

## Reversal cost

Low: restore the manifest-pair condition and its tests, at the cost of rejecting
valid consumer maintenance again. No persistent schema or dependency changes.

## Sources

- https://bun.sh/docs/pm/lockfile
- https://bun.sh/docs/pm/cli/update
