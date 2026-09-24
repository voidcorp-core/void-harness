---
schemaVersion: 1
id: "adr:c3c5eada-4c1d-4570-b707-526df55198b4"
createdAt: "2026-09-24T21:37:47.878Z"
title: "The independent review runs in GitHub Actions from the default branch, and the queue believes its runs"
status: accepted
deciders: ["folpe"]
supersedes: ["adr:f592ded5-108e-474e-b23e-173493550326"]
---

# The independent review runs in GitHub Actions from the default branch, and the queue believes its runs

## Context

The decision it supersedes moved the independent review into a GitHub Actions
job on `pull_request_target` and stated that the workflow, its scripts and its
instructions come from the pull request's base branch, develop. GitHub's
reference says otherwise: `pull_request_target` runs in the context of the
default branch of the repository, main here, with `GITHUB_REF` and
`GITHUB_SHA` on it. The first pull request after #407 got no review at all,
because main did not hold the workflow yet, and the environment built for the
job admitted develop, the one branch the job never runs on.

## Decision

The independent review runs as the `independent-review.yml` job on
`pull_request_target`, from the default branch, main, and the merge queue lets a
pull request through only on a successful run of that workflow, run from a
commit main holds, for the pull request's exact head; the model credential
lives in an environment whose deployment branch policy admits main alone.

## Consequences

Positive:

- The review's workflow, scripts and instructions come from the branch only a
  person merges into, a stronger anchor than develop, which the loop merges
  into on its own.
- The queue's provenance check reads the default branch from GitHub rather
  than assuming one, so it follows a repository whose default branch differs.

Negative:

- A change to the review takes effect only once promoted to main: until then,
  pull requests into develop are reviewed by main's version, and a repository
  whose main does not hold the workflow reviews nothing.
- Introducing the review, as #407 did, therefore needs a promotion before the
  first review runs, and the queue refuses every pull request in between.

## Alternatives considered

- Run the review on `pull_request` from the pull request's own workflow: the
  pull request could then rewrite its judge and reach the model credential.
- Run it on `workflow_run` after develop's CI: it also runs from the default
  branch, adds a hop, and changes nothing about where the workflow comes from.

## Reversal cost

Low. The workflow, the verifier and the environment are small and local; moving
the anchor elsewhere changes one comparison and one branch policy.
