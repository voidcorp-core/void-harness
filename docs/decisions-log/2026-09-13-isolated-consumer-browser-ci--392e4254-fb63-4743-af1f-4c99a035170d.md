---
schemaVersion: 1
id: "adr:392e4254-fb63-4743-af1f-4c99a035170d"
createdAt: "2026-09-13T20:31:28.154Z"
title: "Verify consumer documents in isolated browser CI"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Verify consumer documents in isolated browser CI

## Context

DEV-532 produces an offline HTML document. The connected personal browser
refuses local file URLs; its access policy stays intact. Existing CI already
packs one consumer archive and verifies its source SHA and content digest.
Folpe approved isolated Playwright CI on 2026-09-13.

## Decision

Test regenerated synthetic consumer documents with Playwright on a GitHub-hosted
runner, consuming the existing verified archive and publishing SHA-bound evidence.

The job installs the archive offline into an empty consumer fixture. It never
copies a developer's exported HTML, home directory, browser profile or session.
The browser opens only documents generated in that runner. Network access is
disabled for browser contexts, and unexpected requests fail tests. The connected
browser's permissions and URL policy are unchanged.

## Consequences

Positive:

- Behavioral tests, mobile/desktop captures, no-JavaScript and print checks
  exercise the distributed command, with archive and document hashes in evidence.
- Playwright and axe are source-only QA tools; no consumer runtime dependency.
- No retries, automatic baseline acceptance or inferred accessibility certification.

Negative:

- CI downloads browser tooling and takes longer; one worker bounds resource use.
- Screenshots still need visual review. Automated axe checks do not prove screen
  reader usability or replace real assistive testing.
- The QA tooling lives outside the pnpm workspace. Its small complete dependency
  graph is version-pinned in its private manifest, including axe-core's override;
  npm installs into runner temporary storage without producing a lockfile.
  Dependency updates must recheck that graph for new floating transitive ranges.

## Alternatives considered

- Expand personal-browser file access: rejected because it gives the test surface
  access it does not need and conflicts with the active browser policy.
- Manual-only screenshots: useful supplementary evidence, but no reproducible
  regression gate tied to the distributed archive.
- A public preview server: unnecessary exposure and lifecycle for a deliberately
  offline document, and weaker proof of its no-server behavior.

## Reversal cost

Low: remove the source-only browser tests and CI consumer job. The shipped
command, archive producer and consumer installation contract do not change.

## Sources

- https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/docs/src/ci.md
- https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/docs/src/test-configuration-js.md
- https://raw.githubusercontent.com/dequelabs/axe-core-npm/v4.13.0/packages/playwright/README.md
- https://docs.npmjs.com/cli/v11/commands/npm-install/
