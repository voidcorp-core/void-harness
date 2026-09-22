---
schemaVersion: 1
id: "adr:413ec9cd-c186-4933-916f-215ae8dd54bb"
createdAt: "2026-09-22T14:32:17.199Z"
title: "Develop merges through the GitHub merge queue, gated by a review verdict check"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Develop merges through the GitHub merge queue, gated by a review verdict check

## Context

The cluster engine integrates several tickets into one pull request, reconciles
their commit ranges, seals the suite against the integration SHA and asks a
fresh-context pass to read the whole union before the pull request may merge
itself ([the union is read before it merges](./2026-08-28-union-is-read-before-it-merges--053e6114-d596-4ef5-bb2d-7109bcaa4533.md)).
It costs 25 to 114 minutes per ticket, while the direct mode shipped sixteen in
two hours. The [continuous loop spec](../specs/2026-09-22-autopilot-native-loop.md)
replaces it with one pull request per ticket towards `develop`, each merged by
GitHub itself.

Two properties of the old engine must survive that change. First, two tickets
green on their own but broken together must not reach `develop`: that is what
reconciliation and the sealed suite bought. Second, nothing merges unread: that
is what the union reading bought.

GitHub's [merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
answers the first natively. It builds a temporary branch from the base and every
pull request ahead in the queue, reruns the required checks on that combined
commit, and merges only if they pass. It only waits for checks that answer the
[`merge_group` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group);
a required check whose workflow ignores it blocks the queue forever.

The second has no native equivalent. A reviewer can post a commit status on the
head SHA it read, but in the queue the checks run on a synthetic group commit
nobody reviewed, so a status posted by the reviewer never reaches it.

## Decision

`develop` merges through the GitHub merge queue, and `independent-review` is one
of its required checks: a CI job that passes only when a `success` commit status
named `void/independent-review` sits on the head SHA of the pull request, or, on
`merge_group`, on the head SHA of every pull request the group contains.

- The reviewer is the independent pass of `void-implement`, run in a fresh
  context on the exact SHA. It posts the status; the job only verifies it. Any
  new push changes the head SHA and demands a new verdict.
- The job finds the group from the queue itself: the `head_ref` of the event
  (`gh-readonly-queue/<base>/pr-<n>-<sha>`) names the last pull request, and the
  GraphQL `mergeQueue` entries are followed through their `baseCommit` down to
  the base branch. Every doubt fails the check: an unknown event, a malformed
  ref, an entry missing from the queue, an API error.
- The verifier runs from the base branch with read-only permissions, so a pull
  request cannot rewrite the gate that judges it.
- Every workflow carrying a required check of `develop` answers `merge_group`,
  and steps that read pull_request-only context fall back to the group's
  `base_sha`.
- `main` keeps no queue and no automatic merge. The promotion of `develop` to
  `main` stays human.

Adopted in two steps. The workflows ship first and change nothing on their own.
Turning the queue on and adding `independent-review` to the protection of
`develop` is a repository setting taken by a human, after this record is
accepted.

## What it replaces

- The integration pull request, its reconciliation and its sealed suite: the
  queue rebuilds and retests the combined commit for every group.
- The adversarial reading of the whole union: each pull request is read on its
  own before it enters the queue, and the combined commit is proved by the
  required checks rather than read. The union record is superseded when the
  cluster engine is removed, not before, since that engine still relies on it.

## Consequences

Positive:

- Tickets merge one by one as they become ready, instead of waiting for the
  slowest of a cluster.
- Integration breakage is caught by GitHub on the combined commit, with no
  reconciliation code of our own to maintain.
- The review verdict becomes a check GitHub enforces, not a field a later step
  must remember to read.

Negative:

- The union of several tickets is no longer read as a whole; an interaction the
  tests do not cover can merge. The queue proves the combination builds and
  passes, not that it is coherent.
- A status event starts no workflow, so after posting a verdict the reviewer must
  rerun the `independent-review` job of the pull request.
- The verdict is only as trustworthy as the identity allowed to post it. Any
  actor with write access to statuses can post `void/independent-review`; this
  record does not bind the verdict to a dedicated reviewer identity.
- The canonical back-merge of `main` into `develop` carries no verdict. Once the
  check is required it must receive one, or an explicit exemption must be
  decided before activation.
- The `enforce` step that rejects auto-merge outside the back-merge still
  applies to ticket pull requests; it must be revisited before the loop enables
  auto-merge on them.
- The merge queue requires a repository owned by an organization. Consumers
  outside one fall back to serial merges, per the spec.

## Alternatives considered

- **Keep the integration pull request.** Rejected: it is the cost this change
  exists to remove, and it duplicates what the queue does natively.
- **Require the `void/independent-review` status directly in branch
  protection.** Rejected: the queue waits for it on the group commit, where no
  reviewer can post it, so every group would stall.
- **Have the reviewer post the status on the group commit.** Rejected: the group
  commit exists only while the queue builds it, and changes whenever a pull
  request ahead leaves the queue; the reviewer would have to watch the queue and
  would be reading a commit it did not review.
- **Serial merges without a queue** (update on the base, run the checks, merge,
  next). Kept as the fallback for repositories without a queue: same guarantee,
  lower throughput.

## Reversal cost

Low. Turning the queue off and removing `independent-review` from the protection
of `develop` restores pull request merges; the workflow triggers are inert
without a queue. It rises once the cluster engine is removed, because returning
to it would mean restoring that engine.
