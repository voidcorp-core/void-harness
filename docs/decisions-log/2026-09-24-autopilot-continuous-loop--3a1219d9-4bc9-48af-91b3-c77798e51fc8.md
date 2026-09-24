---
schemaVersion: 1
id: "adr:3a1219d9-4bc9-48af-91b3-c77798e51fc8"
createdAt: "2026-09-24T18:09:59.983Z"
title: "Autopilot is a continuous loop that GitHub's merge queue merges for"
status: proposed
deciders: ["folpe"]
supersedes: ["adr:077c5419-ffe2-454f-a50e-9c147cf15ce9"]
---

# Autopilot is a continuous loop that GitHub's merge queue merges for

## Context

The 2026-07-25 decision made autopilot drain a bounded cluster of tickets into
one integration pull request, reconciled, sealed, published and granted by the
CLI, then merged by a person. In use, a unit took 25 to 114 minutes through
that engine where the direct mode delivered sixteen tickets in two hours, and
most of its machinery (reconciliation, sealing, publication, grants, ledgers)
re-implemented what GitHub already does: required checks, a merge queue that
tests each pull request on top of the ones ahead of it, auto-merge bound to a
head. The spec of 2026-09-22 replaced it with a continuous loop, proved on a
real batch on 2026-09-24 (#401, #402, then #404 and #405 through the merge
queue into `develop`).

## Decision

Autopilot is a continuous loop that keeps up to four tickets in flight, one
worker and one pull request each, and leaves every merge to GitHub: it arms a
pull request only on the head a signed review verdict proves, through the merge
queue or an auto-merge request, never into the branch that deploys, and never
arms one that touches the machinery that judges merges.

## Consequences

Positive:

- One way for autonomous work to reach `develop`, and it is GitHub's: the merge
  queue proves each pull request against the ones ahead of it, which the
  integration branch approximated by hand.
- The CLI shrinks to a deterministic kernel (`next`, `stop`, `arm`, `disarm`,
  `verdict`, `fingerprint`, `review-key`, `judgment`) and 38 modules go.
- A pull request merges as soon as it is proven, instead of waiting for the
  slowest ticket of its cluster.

Negative:

- The base must have a merge queue, or a protection that requires a branch up
  to date, and a `void/independent-review` required check; a repository that
  cannot configure either runs the loop serially or not at all.
- The review verdict is signed with a key that lives in one checkout, so the
  orchestrator is bound to that machine until the key is isolated (DEV-877).

## Alternatives considered

- Keep the cluster engine beside the loop: two engines in one release are two
  answers to how autonomous work reaches `develop`, and the cutover of
  2026-07-30 already rejected that for the engine before this one.
- Keep the integration pull request but let the queue merge it: the cluster
  still waits for its slowest ticket, and reconciliation still re-implements
  what the queue does per pull request.

## Reversal cost

High. The engine's modules, subcommands, workflow script and tests are deleted
rather than deprecated; bringing it back means restoring them from history and
re-proving them against a CLI that has moved on.
