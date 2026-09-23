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
  context on the exact SHA. No GitHub App or dedicated identity: the reviewer
  is an agent like the others, and its verdict is written through one command.
  `void-harness autopilot verdict --pr <n> --nonce <seal>` admits the typed
  verdict, refuses it unless its `headSha` is the head the pull request has now
  and the seal answers the digest published there, posts the verdict comment
  with its proof, then the `void/independent-review` status on that head, and re-runs
  the `independent-review` job when its completed run disagrees. It is the only
  write path. The job only verifies the status. Any new push changes the head
  SHA and demands a new verdict.
- The loop believes a verdict comment only when the status on the same head
  agrees with it (clean with `success`, blocking with `failure`) and the
  comment carries a proof that answers the ticket's review seal; any other
  comment is not read.
- The review seal. At assignment the orchestrator draws a 32-byte nonce with
  `autopilot seal --ticket <id>`, recorded once, mode 0600, in
  `.void/machine/autopilot/seals/` of the orchestration checkout, out of every
  worktree. It hands the nonce to the reviewer and never to the worker, and
  publishes only its SHA-256 digest on the pull request
  (`autopilot seal --ticket <id> --pr <n>`, a loop comment). The verdict
  comment carries an HMAC-SHA-256 keyed by the nonce over the pull request,
  the head and the outcome, so the nonce is never posted and a proof does not
  carry over to another head or outcome. `loop-observe` believes a verdict
  only when the digest of the nonce it holds is published on the pull request
  and the proof matches; a digest someone else published answers a nonce the
  loop never drew. A worker that never saw the nonce cannot make a verdict the
  loop believes, whether or not the hook read its command.
- A PreToolUse hook, `review-verdict-write`, wired on Claude and Codex, refuses
  a shell command that writes a `void/independent-review` status (`gh api` or
  curl to `/statuses/`) or posts a comment carrying the verdict block (`gh pr
  comment`, `gh issue comment`, the REST and GraphQL comment endpoints, a body
  sent from a file), and names `autopilot verdict` instead. It reads the words
  the program receives, not the characters typed: quotes and escapes removed,
  glued flags (`-fcontext=...`) and `--flag=value` split, JSON and URL escapes
  undone in the payload, API paths compared without case. It reads what a line
  runs, not only its simple commands: the bodies of `$(...)`, backticks, `<(...)`
  and `>(...)`; the command behind `{`, `(`, `!`, `if`, `then`, `else`,
  `elif`, `do`, `while`, `until` and a function defined on the line; wrappers
  and the values of their options (`nice -n`, `env -C` and `-S`, `stdbuf`,
  `timeout -s` and `-k`, `exec -a`, `sudo -u`); what `find -exec` runs; the
  string of `sh -c`, `eval`, `env -S` and a `gh alias set`; the script a shell
  or `source` reads from a here-document, a here-string or a file it can open.
  A write it cannot read before the command runs is refused: a status context
  or a comment body from a variable, a substitution, a pipe or a file it
  cannot open, an endpoint decided at run time, a `gh api` or comment fed words
  by `xargs` or `parallel`, a shell reading a pipe, `source` of a substitution
  or a variable, a gh command or verb chosen at run time, an imported alias
  file. It does not see a variable expanded unquoted into several words, a
  program it does not parse (`python3 -c`, `node -e`, `hub`, `wget`), a script
  file it cannot open, an alias already in the gh configuration, or a program
  named by a variable at top level. It keeps the honest path the easy one; the
  seal is what makes a forged verdict inert for the loop.
- The hook runs from the installed bundle in `.void/hooks/`, which carries the
  published harness. In this repository it is active only once a release ships
  it and `void-harness init` reinstalls it; until then the loop's agreement rule
  and the seal are the checks on a hand-written verdict.
- The job finds the group from the queue itself: the `head_ref` of the event
  (`gh-readonly-queue/<base>/pr-<n>-<sha>`) names the last pull request, and the
  GraphQL `mergeQueue` entries are followed through their `baseCommit` down to
  the current head of the base branch, read in the same request. Every doubt
  fails the check: an unknown event, a malformed ref, an entry missing from the
  queue, a walk that stops anywhere but that head, an API error.
- The verification script is checked out from the base branch and runs with
  read-only permissions, so a pull request cannot rewrite the script. The
  workflow that calls it is not protected the same way: GitHub runs the YAML of
  the pull request merge ref on `pull_request` and of the group commit on
  `merge_group`, so a pull request that edits the job edits the gate that judges
  it (see Consequences).
- Every workflow carrying a required check of `develop` answers `merge_group`,
  and steps that read pull_request-only context fall back to the group's
  `base_sha`.
- Auto-merge is the default way into `develop`: native auto-merge waits for
  protection and every required check. `void-enforce` refuses an armed
  auto-merge only on a pull request into `main`; the promotion and the release
  pull request are both merged by a person (`release.yml` merges nothing), so no
  exception is carved for release-please.
- `main` keeps no queue and no automatic merge. The promotion of `develop` to
  `main` stays human, and the loop never arms a pull request whose head is a
  branch it merges into or ships from.
- The loop never arms a pull request that touches the machinery judging merges:
  `.github/**`, `scripts/independent-review-check.mjs`, `.void/program.md`,
  `packages/core/hooks/**`, the source of the hook above and its shell parser
  (`packages/hook-runner/src/enforcement/shell-words.ts`), what a judging
  workflow runs from outside `.github` (`scripts/promotion-authority.mjs`,
  which the promotion audit runs from develop itself,
  `scripts/auto-merge-contract.mjs`, `scripts/verify.mjs`, which aggregates the
  required CI verdict, and `packages/core/enforce/**`), the loop code that
  believes a verdict and arms a merge, this floor included
  (`packages/cli/src/lib/autopilot/loop.ts`, `loop-observe.ts`,
  `review-seal.ts`, `packages/cli/src/commands/autopilot-loop.ts`), plus what runs
  before any release: the installed runner (`.void/hooks/**`), the files that
  wire it (`.claude/settings.json`, `.codex/**`) and the configuration that
  scopes it (`.void/config.json`). That floor is a constant;
  `autopilot.protectedPaths` in the programme adds to it and cannot remove from
  it. The changed files are read through REST, which names the source of a
  rename as well as its destination, and both are checked: moving a protected
  file away is changing it. Such a pull request goes to a person with the file
  named, as does one whose change list could not be read in full (beyond ten
  pages of a hundred files).
- The release back-merge (`chore/back-merge-main` into `develop`) needs no
  verdict. The check recognises it only by facts a pull request cannot choose:
  the release App's bot account by numeric id and `Bot` type, the branch, the
  base and a same-repository head, in the event payload and in the queue alike.
  Then its commits are proved in git, since anyone able to push to the branch
  could add one the author check alone would pass: the head is on `main`
  already (the merge fast-forwarded, as on #379), or it is a two-parent merge
  whose first parent is on `develop`, whose second is on `main`, whose tree
  equals `git merge-tree --write-tree` of the two, and it is the only commit of
  the pull request `main` does not hold. Any other shape, a git error included,
  demands a verdict like any other pull request; the job checks out the full
  history for it, with the same read-only permissions.
- The promotion audit (`promotion.yml`, judged by
  `scripts/promotion-authority.mjs`) accepts a pull request into `develop` in
  three cases only: merged by hand by the named human with no auto-merge or
  merge queue event; merged automatically with a `success`
  `void/independent-review` status on its head SHA, the verdict the required
  check held it to; or the back-merge, proved by the construction above,
  replayed against `develop` as it stood (the integration commit's first
  parent) and never on its author. An unproven back-merge needs the verdict,
  since it merged automatically too. Anything else refuses the promotion, and
  so does any doubt: a missing field, a status not read on the head, a
  truncated timeline, a git or API error. The promotion stays a human merge.
- The loop re-runs a red `independent-review` job at most twice per run, the
  verdict command's own re-run included, reading the attempt number GitHub
  keeps; past that, a person looks.

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
- A status event starts no workflow, so the verdict command re-runs the
  `independent-review` job after posting, and the loop re-runs it at most twice.
- The workflow file is the change's own: a pull request that replaces the
  `independent-review` job with one that always passes keeps the required check
  green. The loop never merges such a pull request (protected paths), but a
  person or any other actor arming auto-merge still can. Pinning the workflow
  (a required workflow ruleset on `develop`) remains open.
- **The verdict protections guard against a mistake and an injected
  instruction, not against a malicious actor holding the credentials or the
  disk.** Any identity with write access to statuses and comments can still
  post both through the API; the hook reads `gh` and curl commands, and a
  script or another HTTP client reaches the API unseen. The seal is what the
  loop trusts instead, and it is a file readable by the user every agent runs
  as: a worker that reads the orchestration checkout, or the reviewer's
  context, holds it. Binding the verdict to a dedicated identity was
  considered and not taken.
- A worker can still run `autopilot verdict` on its own pull request, but not
  with a seal it was never given: the command refuses a nonce whose digest the
  pull request does not carry, and the loop believes no proof keyed by any
  other. The orchestrator, which draws the seal, gives it to the reviewer only.
- The seal binds the loop, not GitHub. The required `independent-review` job
  and the promotion audit cannot hold the nonce, so they still trust the
  status alone. The loop arms auto-merge only on a head whose verdict it
  believes, with `--match-head-commit`; but GitHub keeps an armed auto-merge
  across a later push by an account with write access, so a push after arming
  followed by a forged status on the new head satisfies the required check
  ([GitHub disables it only on a push by someone without write permission](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request)).
  Disarming an auto-merge whose head no longer carries a believed verdict is
  not done yet.
- The back-merge exemption rests on what `back-merge.yml` produces by
  construction, not on a setting of the repository: no rule on
  `chore/back-merge-main` is needed. If that workflow ever changes how it
  builds the branch, the check refuses the exemption until it is aligned.
- The promotion audit trusts the verdict status as much as the required check
  does, no more: a success status posted on a head by anyone able to write
  statuses lets that pull request's commits reach the promotion, which a person
  still reads and merges. The status stays on the commit after the merge, so a
  verdict later rewritten to failure refuses the next promotion until someone
  looks.
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
