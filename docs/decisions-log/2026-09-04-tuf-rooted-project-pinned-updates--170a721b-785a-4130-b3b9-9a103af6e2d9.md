---
schemaVersion: 1
id: "adr:170a721b-785a-4130-b3b9-9a103af6e2d9"
createdAt: "2026-09-04T10:06:08.905Z"
title: "Use TUF-rooted side-by-side project-pinned updates"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Use TUF-rooted side-by-side project-pinned updates

## Context

The current updater has accumulated branches for historical install shapes and has confused desired
state with observed receipts. A global latest-version switch cannot guarantee reproducibility,
rollback or protection from repository and metadata rollback. The native engine also needs to
update without replacing a known-good binary in place.

## Decision

Use a TUF-rooted launcher that installs content-addressed engines side by side while each project
pins its exact engine, contracts and content in `machine.lock.json`.

The updater verifies signed metadata and provenance, dry-runs migrations, journals activation,
runs consumer conformance, atomically switches the local receipt and automatically returns to a
retained known-good engine when the smoke check fails.

## Consequences

Positive:

- Project runs are reproducible and protected against rollback, freeze and mix-and-match attacks.
- Download, activation and project adoption become separate recoverable operations.

Negative:

- TUF key rotation, expiry and release-role operations add maintainer responsibility.
- Two recent engines and backward-readable schema windows consume more disk and test capacity.

## Alternatives considered

- **npm semver and integrity alone**: retained as a compatibility distribution channel, but rejected
  as update authority because it does not express project pins or the complete rollback protocol.
- **`cargo-dist` experimental updater**: rejected as the production updater; cargo-dist remains
  useful for building archives and installers.
- **Replace the active binary in place**: rejected because interruption can remove the only working
  recovery path.

## Reversal cost

**High.** Changing the update trust root or project-lock semantics requires a signed trust migration
and coordinated support window. Side-by-side engines make ordinary version rollback low-cost.
