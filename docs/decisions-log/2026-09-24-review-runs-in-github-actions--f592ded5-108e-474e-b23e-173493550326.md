---
schemaVersion: 1
id: "adr:f592ded5-108e-474e-b23e-173493550326"
createdAt: "2026-09-24T20:21:02.440Z"
title: "The independent review runs as a GitHub Actions job, published as a check only that app creates"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# The independent review runs as a GitHub Actions job, published as a check only that app creates

## Context

The review verdict that gates `develop` was signed with an Ed25519 key kept in
the orchestration checkout, under the same OS user as the workers. A worker runs
the project's tests, so third-party code: a compromised test dependency could
read the key, sign a clean verdict and send unread code through the merge queue
(DEV-877). Keeping the key out of that code's reach on the same machine would
have meant sandbox profiles, tool allowlists and a rule that the orchestrator
never runs project code, maintained around one secret among several the machine
holds. The article DEV-877 cites prescribes the opposite shape: credentials are
never reachable from where generated code runs.

## Decision

The independent review is a GitHub Actions job on `pull_request_target` that
reads the pull request head as data with read-only tools and publishes its
verdict as the `independent-review` check run on that head, created with the
job's `GITHUB_TOKEN`, so by the GitHub Actions app, the only source branch
protection accepts for the check.

## Consequences

Positive:

- No review secret exists on any developer's or worker's machine; what forges
  an approval is now a GitHub App identity, which no local token can assume.
- The signing key, `review-key`, `verdict`, the signature format, the public key
  on the base and their verification script are deleted rather than guarded.
- The workflow, its scripts and the reviewer's instructions come from the base
  branch, so a pull request cannot rewrite its own review, and the model
  credential never reaches code the pull request controls.

Negative:

- Each ready pull request costs a review run in CI, against the repository's
  `CLAUDE_CODE_OAUTH_TOKEN` secret.
- A pull request can still add a `pull_request` workflow that publishes a check
  under the same name; the loop never merges a change under `.github/**`, and
  pinning required workflows to the base stays the open question the merge
  queue decision recorded.

## Alternatives considered

- Keep the local key and isolate it from workers with the runtime sandboxes
  (Claude Code `denyRead`, Codex filesystem deny): rules to maintain around one
  file, while the same machine holds other credentials the same code can read.
- A separate OS user or a hardware key per signature: strongest locally, but
  root setup on every machine, or a person's touch on every merge, which ends
  the autonomy the loop exists for.

## Reversal cost

Medium. Restoring the signed verdict means bringing back the key commands, the
signature module and its verification from history; the kernel's reading of a
check and a bot comment would be replaced again.
