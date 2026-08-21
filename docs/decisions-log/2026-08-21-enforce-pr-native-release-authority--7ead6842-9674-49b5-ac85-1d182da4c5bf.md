---
schemaVersion: 1
id: "adr:7ead6842-9674-49b5-ac85-1d182da4c5bf"
createdAt: "2026-08-21T16:02:47.840Z"
title: "Enforce PR-native release authority and isolate npm OIDC publication"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Enforce PR-native release authority and isolate npm OIDC publication

## Context

The normal release has two meaningful decisions: promote `develop` to `main`, then merge the
release-please pull request after reading its version and changelog. A required environment reviewer
added a third click in Actions without adding a new decision, so the repository deliberately removed
it.

That leaves two enforcement gaps. The repository-scoped Release App needs `Contents: write` to create
release metadata and the automatic back-merge, and that permission can also merge a pull request
through the GitHub API unless `main` restricts who may push. Separately, the current publish job gives
OIDC authority to the same process tree that installs dependencies and runs repository scripts.

This record complements the accepted back-merge and npm environment reviewer decisions. It changes
neither decision and supersedes neither record.

## Decision

The release boundary is enforced by allowing only `folpe` to merge into `main`, reserving native
auto-merge operationally for the canonical `main` to `develop` back-merge, rejecting noncanonical
use through required checks and promotion evidence, validating and packing the release without OIDC,
and granting `id-token: write` only to a minimal job that publishes the verified tarball. A separate
non-OIDC job cryptographically binds registry provenance to the exact bytes and release execution.

## Consequences

Positive:

- The two human actions stay on pull request pages, where the release content is already visible.
- A compromised Release App token cannot cross `main` by merging either human-gated pull request.
- Dependency and repository code cannot request the npm publishing credential.
- `develop` still receives the approved version and changelog automatically after required checks.

Negative:

- `folpe` is a single release-authority identity until another explicitly trusted maintainer is added.
- The release workflow gains an artifact handoff, integrity contract and tag-based recovery path.
- GitHub App permissions cannot be scoped to one `develop` PR. A compromised Release App can still
  write or merge on `develop`; required checks detect normal misuse, and the human-reviewed,
  actor-restricted `main` boundary contains publication risk.
- External GitHub and npm settings remain part of the trust boundary and require periodic audit.

## Alternatives considered

- **Keep an environment reviewer:** rejected because it repeats the release PR decision in the Actions
  UI and does not reduce the Release App's ability to merge into `main`.
- **Require an approving review on release PRs:** rejected because the sole maintainer would need a
  separate approval plus merge instead of one deliberate merge action.
- **Disable repository auto-merge:** rejected because it turns the already approved back-merge into a
  third human merge and lets `develop` drift after releases.
- **Build and publish in one OIDC job:** rejected because every dependency and repository script in
  that job can request the same short-lived credential as the publish command.

## Reversal cost

Medium. Branch and Actions settings can be reverted without migrating data, and the workflow can be
collapsed back to one job. The change would deliberately weaken a production supply-chain boundary
and would require a superseding ADR, updated tests and another observed release.
