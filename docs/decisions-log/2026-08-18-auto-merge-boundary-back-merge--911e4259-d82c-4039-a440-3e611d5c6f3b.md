---
schemaVersion: 1
id: "adr:911e4259-d82c-4039-a440-3e611d5c6f3b"
createdAt: "2026-08-18T13:38:52.000Z"
title: "Auto-merge is refused where a human must read a diff, allowed where none is new"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Auto-merge is refused where a human must read a diff, allowed where none is new

## Context

This repository says there is no auto-merge on any path, and enforces it: the
`autopilot` CLI refuses `--auto-merge`, and tests pin that refusal. The reason
has always been stated as a property of the work, not of the mechanism: merging
is where a human reads the diff as a whole, and a cluster of tickets integrated
by a robot is exactly where that reading matters most.

The back-merge pull request meets none of that description. It carries the
version bumps and the changelog that release-please wrote, and a human approved
them minutes earlier by merging the release pull request. There is no diff in it
that anyone has not already seen, and no decision left to take. Asking for a
second reading of the same bytes is ceremony, and ceremony is what teaches people
to click through the pull requests that do matter.

Left manual, it is also the step most likely to be forgotten, since it happens
after the interesting part is done. It was paid three times in one day before it
was automated at all.

## Decision

Auto-merge is refused on any pull request carrying a diff a human has not read,
and allowed on one whose entire content was already approved. Today that is
exactly one: the automated back-merge of `main` into `develop`.

It uses GitHub's native auto-merge, which waits for the required checks and
respects branch protection. Nothing bypasses a gate: a failing check leaves the
pull request open, exactly as it would for anyone else.

## Consequences

Positive:

- The step least likely to be remembered stops depending on being remembered,
  and the branch that blocks the next promotion stops being the one nobody
  notices is behind.
- The rule that survives is sharper than the one it replaces. "No auto-merge"
  was a mechanism ban standing in for a principle; the principle is that no
  unread diff merges itself, and it is now stated as such.

Negative:

- The word auto-merge now appears in the repository, and someone will read it as
  the doctrine having been relaxed. This record is the answer to that reading,
  and it is the reason it exists.
- The boundary is a judgement, not a check. Nothing mechanically prevents a
  second pull request from claiming its content was already approved. The
  `autopilot` refusal stays enforced in code, because that is the path where the
  temptation is real.

## Alternatives considered

- **Leave it manual.** Rejected: the content is already approved, so the click
  adds no review, and a step that adds no review but can be forgotten is a step
  that will be. It had already been missed three times in a day.
- **Push straight to `develop` from the workflow.** Rejected, and it is the more
  tempting shortcut: it would need protection to be bypassable by the App, and a
  branch a robot may bypass is not protected. Native auto-merge gets the same
  outcome while leaving every gate standing.
- **Extend auto-merge to the release pull request as well.** Rejected: that one
  publishes to npm and is the deliberate human action the whole release flow is
  built around. It carries no unread diff either, but it takes an irreversible
  step outward, which is a different reason to stop.

## Reversal cost

Low. Removing one line from the workflow, or turning the repository setting off,
restores the previous behaviour with no migration and no state to unwind.
