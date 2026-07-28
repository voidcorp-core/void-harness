---
schemaVersion: 1
id: "adr:80c46fb4-ea93-4837-9ccb-c73810342ad9"
createdAt: "2026-07-28T15:15:27.234Z"
title: "Protected release pull requests receive CI before merge"
status: accepted
deciders: ["Florent PELLEGRIN"]
supersedes: ["legacy:2026-07-24-gate-the-publish-job-not-the-release-pr"]
---

# Protected release pull requests receive CI before merge

## Context

`main` now requires five strict checks: `validate`, `enforce`, and install
conformance on Linux, macOS, and Windows. Release Please opens or updates its PR
with the repository `GITHUB_TOKEN`; those PR events do not produce unattended
workflow runs. The previous decision compensated by validating the tagged tree
inside the publish job. That remains necessary, but it happens after the human
merge and therefore cannot satisfy branch protection before the release is cut.

## Decision

When Release Please reports that it created or updated a PR, resolve exactly one
bounded open `autorelease: pending` PR and dispatch both `ci.yml` and
`void-enforce.yml` on its exact head branch.

Both workflows expose `workflow_dispatch`, an event GitHub guarantees will run
when requested with `GITHUB_TOKEN`. The release workflow receives only the
additional `actions: write` permission required for that dispatch. Zero or
multiple candidates fail closed. The publish job keeps its independent
validation of the tagged tree.

## Consequences

Positive:

- Release PRs satisfy the same server-side checks as feature PRs before merge.
- No PAT, long-lived secret, bypass actor, or weaker branch rule is introduced.
- The publish path remains protected against tag-time and manual re-publish drift.

Negative:

- Each release PR update starts two explicit workflows and consumes one full CI run.
- The dispatch depends on Release Please's `autorelease: pending` label contract.
- A duplicate or missing candidate blocks the release and requires investigation.

## Alternatives considered

- Authenticate Release Please with a PAT: rejected because it adds a durable
  credential solely to recover workflow triggering.
- Bypass or remove required checks for release PRs: rejected because the version
  bump and generated changelog are still code that must be verified before merge.
- Keep only the publish-job gate: retained as defense in depth but insufficient
  alone because protected `main` must decide before the release merge.

## Reversal cost

Low. Removing the explicit dispatch only touches the two workflow triggers, the
release step, and its documentation, but requires an equally strong pre-merge CI
mechanism first.
