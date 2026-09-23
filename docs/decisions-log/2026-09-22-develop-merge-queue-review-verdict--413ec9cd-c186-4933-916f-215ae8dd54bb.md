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
`merge_group`, on the head SHA of every pull request the group contains, and the
latest verdict signed for that head by the review key says `success`.

- The reviewer is the independent pass of `void-implement`, run in a fresh
  context on the exact SHA. No GitHub App or dedicated identity: the reviewer
  is an agent like the others, and its verdict is written through one command.
  `void-harness autopilot verdict --ticket <id> --pr <n>` admits the typed
  verdict, refuses it unless its `headSha` is the head the pull request has now,
  posts the verdict comment signed by the review key, then the
  `void/independent-review` status on that head, and re-runs the
  `independent-review` job when its completed run disagrees. It is the only
  write path. Any new push changes the head SHA and demands a new verdict.
- The loop believes the latest verdict the review key signed on the head, and
  only when the status on the same head agrees with it (clean with `success`,
  blocking with `failure`); any other comment is not read.
- The review key. `autopilot review-key` draws an Ed25519 pair once, in the
  orchestration checkout: the private half in
  `.void/machine/autopilot/review-key.pem`, mode 0600, refused unless git
  ignores it; the public half in `.github/void-review.pub`, which a person
  commits and merges into the base. `autopilot verdict` signs, with
  `node:crypto` Ed25519, the repository, the ticket, the pull request, the
  head, the outcome, a SHA-256 of the admitted findings and the time; the
  signature and its fields end the verdict comment. The required
  `independent-review` job reads the public key and its script from the base
  branch, so a pull request can rewrite neither, verifies every signature on
  the pull request, keeps those bound to this repository, pull request and
  head, and requires the latest, by the time it was signed at, to say
  `success`. A copy of an older verdict posted again keeps its time and
  changes nothing. There is no expiry: the head is immutable, so a verdict on
  it does not age, and an expiry would turn a slow queue into a second review.
  The loop verifies the same way, also binds the ticket, and trusts the key on
  the base only when it is the public half of the private key it holds: a key
  swapped on the base answers a private key the loop never drew, so the loop
  believes nothing and disarms what it armed. A worker without the private key
  cannot make the required check pass, whatever command it runs.
- The public key is a versioned file, not a repository variable. GitHub lets
  any collaborator with write access create or update a repository variable
  ([REST, variables](https://docs.github.com/en/rest/actions/variables#create-a-repository-variable):
  "collaborator access to a repository to create, update, or read variables"),
  so the token a worker uses could replace it in one call, leaving no trace in
  git. A file on the base changes only through a merge, `.github/**` is already
  ground the loop never merges, and its history is the audit.
- `review-key` and `verdict` refuse to run anywhere but the orchestration
  checkout, recognised by git itself: its Git directory is the repository's
  common one, where a linked worktree, a worker's, has its own (`git rev-parse
  --path-format=absolute --git-dir --git-common-dir`). The official commands
  therefore cannot draw or use a key from the worker's worktree.
- The loop disarms what it can no longer vouch for. GitHub exposes no armed
  head and keeps an auto-merge armed across a push by anyone with write
  access, so `autopilot arm` records the head in
  `.void/machine/autopilot/armed/`, arms with `--match-head-commit` on that
  head and reads GitHub back, disarming at once if the head moved meanwhile.
  On every tick, an armed pull request whose head differs from the record is
  disarmed and handed back to its worker, the new head being unreviewed; one
  whose armed head no signed verdict proves clean, or whose
  arming nobody recorded, is disarmed and handed to a human. An armed merge
  survives a tick only while the loop vouches for its head (recorded, proven)
  and hands it to nobody, waiting for the merge or re-running the job that
  lets it through. Every other outcome carries the disarm, ahead of it: a
  worker at work, any hand-back (failed checks, a conflict, an ejection), a
  human wait whatever its cause, including a ticket already waiting, whose
  pull request a person merges. An immediate stop disarms every armed pull
  request, proven ones included, before it freezes, and refuses to report a
  freeze when it cannot read what is armed, naming what to disarm by hand.
  `autopilot disarm` reads GitHub back and fails while the auto-merge stays.
- No hook reads shell commands for a hand-written verdict. One did, and every
  review found forms it missed (a capital in `-c`, `/dev/stdin`, a file
  rewritten later on the line, globs and brace expansions in the program
  name, launchers and shells it did not list): parsing a shell line is never
  complete, so such a rule is maintained more than it protects, and any other
  HTTP client bypasses it anyway. The barrier is cryptographic instead: the
  required job refuses a verdict the review key did not sign, whatever wrote
  the status, and the loop disarms whatever it can no longer vouch for.
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
  `packages/core/hooks/**`, what a judging
  workflow runs from outside `.github` (`scripts/promotion-authority.mjs`,
  which the promotion audit runs from develop itself,
  `scripts/auto-merge-contract.mjs`, `scripts/verify.mjs`, which aggregates the
  required CI verdict, and `packages/core/enforce/**`), what judges a
  publication (`scripts/prepare-release-artifact.mjs`,
  `scripts/verify-release-publication.mjs` and the
  `release-artifact-contract.mjs` and `release-provenance-contract.mjs` they
  read, run by `release.yml` from the commit it releases), the loop code that
  believes a verdict and arms a merge, this floor included
  (`packages/cli/src/lib/autopilot/loop.ts`, `loop-observe.ts`,
  `review-signature.ts`, `packages/cli/src/commands/autopilot-loop.ts`), plus what runs
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
  three cases only: a `success` `void/independent-review` status on its head
  SHA, the verdict the required check held it to, whoever merged it and
  whatever its timeline records (`gh pr merge --auto` on a pull request
  already mergeable merges at once without an auto-merge event); merged by
  hand by the named human with no auto-merge or merge queue event; or the back-merge, proved by the construction above,
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
- **The review key guards against a worker and an injected instruction, not
  against an actor holding the disk.** Any identity with write access to
  statuses and comments can still post both, through any client; neither
  passes the required check without a signature. The private key is a file
  readable by the user every agent runs as, so a process that reads the
  orchestration checkout can sign. Binding the verdict to a dedicated identity
  or a separate OS user was considered and not taken; the key is the smaller
  step that makes GitHub itself refuse an unsigned verdict.
- A worker can still run `autopilot verdict` from its worktree: it refuses
  there, and a separate clone holds no private key.
- The required check and the loop now demand the same proof, so a forged
  status on a head pushed after arming no longer merges: GitHub keeps an armed
  auto-merge across a later push by an account with write access
  ([it disables it only on a push by someone without write permission](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request)),
  but the new head carries no signed verdict. The loop still disarms before it
  hands a head to anyone who may push, and disarms a moved or unproven head on
  its next tick. What remains open is the workflow file above: a pull request
  that rewrites the job, or the `sparse-checkout` of the key, is judged by
  itself until the workflow is pinned by a ruleset.
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
