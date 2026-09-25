---
schemaVersion: 1
id: "adr:03e82acc-0f4b-4718-9b88-3d1b2acd4903"
createdAt: "2026-09-24T22:30:07.088Z"
title: "The independent review check is posted by a GitHub App of its own, and branch protection requires that App"
status: accepted
deciders: ["folpe"]
supersedes: ["adr:c3c5eada-4c1d-4570-b707-526df55198b4"]
---

# The independent review check is posted by a GitHub App of its own, and branch protection requires that App

## Context

The decision it supersedes has the review job, run from main, publish the
`independent-review` check with its `GITHUB_TOKEN`, and has the queue believe
that check only on a run of the review workflow for the exact head. Every
job's `GITHUB_TOKEN` is a token of the GitHub Actions app, so the check itself
proves nothing: any workflow on any branch, a pull request's own included, can
post a successful check under that name. The queue's defence rested on reading
runs, titles and provenance, and each assumption in it (where
`pull_request_target` runs, what a run's `head_sha` names) needed a fix of its
own. GitHub's answer to "who may set this status" is the required check's
source: branch protection and rulesets pin a required check to one GitHub App,
and only that App's check satisfies it.

## Decision

A dedicated GitHub App, holding the Checks permission alone and installed on
this repository only, posts the `independent-review` check: the review job on
each head, and a `workflow_run` job of `ci` on each merge group once every head
of the group carries that App's successful check; its key lives in the
`independent-review` environment, which admits main alone, and branch
protection requires the check from that App.

## Consequences

Positive:

- The check proves its origin by construction: a workflow that cannot read the
  key cannot mint the App token, and a check from any other source does not
  satisfy the requirement.
- The queue verifier no longer reads runs, titles or the compare API; it reads
  the App's check on each head, and the promotion audit filters by the same id.
- Both jobs run from main, `pull_request_target` and `workflow_run` alike, so a
  pull request can edit neither its judge nor its gate.

Negative:

- One more credential to hold: the App's private key, rotated by a person in
  the environment, and two repository variables, its client id and its id.
- Setting up a repository needs the App created and installed before the first
  review, and the required check re-pinned to it.

## Alternatives considered

- Keep the check from GitHub Actions and verify its provenance from runs: every
  rule added to that verifier was a rule about the tool rather than the tool,
  and the underlying check stayed forgeable.
- Sign the verdict with a key the queue verifies: that is the mechanism #407
  removed, which needed the key outside GitHub and a sandbox around the worker.
- Reuse the release App: it holds contents and pull request permissions a check
  does not need, and a review key able to write code widens what a leak costs.

## Reversal cost

Low. The App, two variables, one secret and the required check's source are
settings; the scripts take the App id as input and change nowhere else.
