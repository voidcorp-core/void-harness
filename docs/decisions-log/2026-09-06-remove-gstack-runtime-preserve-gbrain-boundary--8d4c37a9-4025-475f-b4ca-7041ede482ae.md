---
schemaVersion: 1
id: "adr:8d4c37a9-4025-475f-b4ca-7041ede482ae"
createdAt: "2026-09-06"
title: "Remove the GStack runtime while preserving the external GBrain boundary"
status: accepted
deciders: ["@folpe"]
supersedes: []
---

# Remove the GStack runtime while preserving the external GBrain boundary

## Context

The capability audit is complete. The harness owns the QA, design, review,
debugging, PDF, and shipping paths that were previously routed through GStack.
The remaining user-level GStack tree is runtime state and duplicate skills, not
an unmet harness capability. ADR-0001 preserves the iOS source, and ADR-0002
keeps GBrain external until its exit criterion is met.

## Decision

Remove the GStack runtime and its dropped duplicate skills after an archive and
knowledge migration. Preserve the iOS source separately. No standalone
`~/.gbrain` installation was present; preserve the four GBrain-facing skills and
their helper bundle under `~/.gbrain` so they remain external and outside the
harness installation boundary.

Project knowledge is migrated into its owning sources: DECLIK doctrine and
decision records. Raw sessions, credentials, browser profiles, and tokens are
never copied into those sources.

## Consequences

- Fresh Claude sessions no longer discover GStack commands or the browse daemon.
- Native harness and claude-in-chrome paths are the only supported QA and ship
  routes.
- The dated archive is the rollback mechanism for 30 days; restoring it is an
  explicit human action.
- Historical provenance remains in source notes and decision records; it is not
  an active runtime dependency.

## Reversal

Restore the archived paths into a temporary location, verify the manifest, and
restore only the paths required by a human-approved rollback. Do not overwrite
new project doctrine or decisions without preserving their current versions.
