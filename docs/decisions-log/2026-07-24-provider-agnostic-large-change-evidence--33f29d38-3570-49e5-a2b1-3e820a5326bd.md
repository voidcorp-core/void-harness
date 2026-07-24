---
schemaVersion: 1
id: "adr:33f29d38-3570-49e5-a2b1-3e820a5326bd"
createdAt: "2026-07-24T19:01:00.000Z"
title: "Keep large-change evidence provider-agnostic"
status: accepted
deciders: [Folpe]
supersedes: []
---

# Keep large-change evidence provider-agnostic

## Context

The large-change hook queried an open pull request through `gh` and parsed its
body with `jq`. It therefore failed outside GitHub, contradicted the local
offline runtime, and exited non-zero while describing itself as advisory.

## Decision

Large-change assessment uses Git data only. It compares the current branch with
an explicit base, its upstream, or a conventional local base, then counts added
text lines from `git diff --numstat`. An atomic change is justified by a
`large-cl-justification: <reason>` trailer in a commit message.

The check emits a canonical degraded hook outcome and a diagnostic when the
threshold is exceeded, but exits successfully. Missing Git or base evidence is
visible as skipped or degraded, never inferred as success.

## Consequences

Positive:

- The same behavior works with GitHub, GitLab, self-hosted forges and offline.
- The justification travels with the branch and remains reviewable in Git.
- Advisory means non-blocking in practice, not only in documentation.

Negative:

- Teams that squash commits must preserve the justification trailer.
- A forge module may still enrich Mission Control with pull-request metadata,
  but it cannot become a base runtime requirement.

## Alternatives considered

- Keep reading the pull-request body: rejected because it makes a forge account
  and provider CLI part of the runtime contract.
- Block the push above the threshold: rejected because size is a reviewability
  signal, not a universal correctness invariant.

## Reversal cost

Low. Provider modules can add evidence without changing the Git-only baseline.
