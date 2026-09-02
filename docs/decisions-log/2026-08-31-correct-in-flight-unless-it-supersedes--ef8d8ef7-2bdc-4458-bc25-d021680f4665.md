---
schemaVersion: 1
id: "adr:ef8d8ef7-2bdc-4458-bc25-d021680f4665"
createdAt: "2026-08-31T02:40:00.000Z"
title: "A correction lands in the artefact in flight, unless it contradicts a decision"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# A correction lands in the artefact in flight, unless it contradicts a decision

## Context

Spec drift is the documented failure of every spec-driven workflow in this family: the written
artefacts stop matching what implementation revealed, and they stop matching because corrections
are deferred. Something is found, a note is made, a successor spec is imagined, and the file that
governs the work quietly becomes false.

On 2026-08-31 three corrections went the other way. An unconstrained argv, an absence that
conflated three causes, and six unattended hours nobody could read were all found by review and
all written into the spec and the plan the same day, not into a "v2". That is why the plan was
true enough to point a programme descriptor at it a few hours later.

So correcting in flight is the rule. It also has an obvious way to go wrong, and Folpe named it:
a correction is local and urgent while doctrine is global and quiet, so the cheapest thing to do
is solve the immediate problem and not notice that a decision somewhere forbade it. Applied
without a check, "correct it in the artefact" becomes the mechanism by which a local fix rewrites
a design nobody re-read.

## Decision

A correction is applied to the artefact being worked on — the spec, the plan, the descriptor, the
skill — rather than deferred into a successor artefact.

Before applying it, name what it touches: **which accepted decision, doctrine line, or spec
commitment the correction bears on, and whether it honours that or contradicts it.**

- **Honours it, or touches none** — apply it in place. Say in the commit which one it honours, so
  the check is visible rather than claimed.
- **Contradicts it** — the correction is not a correction. It is a supersession, and it goes
  through the mechanism that already exists for that: a new decision file whose `supersedes` names
  the one it replaces. Accepted decision content is immutable; an in-flight edit that quietly
  reverses one is the failure this guardrail exists to prevent.

The check is stated out loud even when it comes back empty. A check nobody can see did not happen,
which is the same standard this project already applies to a tracker search and to a specialist's
arbitration.

## Consequences

Positive:

- The artefacts stay true, which is what makes them safe to point a descriptor at, and what makes
  a resuming session able to trust them.
- A design change stops being able to arrive disguised as a fix. It has to announce itself.
- The mechanism it routes to already exists and is already gated: `decisions:check` enforces
  immutability, so a reversal that skips supersession is a red build rather than a judgement call.

Negative:

- Every correction now carries a sentence of justification, including the many that touch nothing.
  That is the cost of the check being visible, and it is paid on the cheap cases to be available
  on the expensive one.
- Judging "contradicts" is itself a judgement, and 164 accepted decisions is more than anyone
  re-reads per correction. The honest scope is the decisions the artefact under edit already
  cites, plus the doctrine the change obviously bears on — not an exhaustive sweep.

## Alternatives considered

- **Correct freely in flight, and catch contradictions at PR review.** Rejected: review reads a
  diff, and a spec edit that reverses a decision looks exactly like a spec edit that refines one.
  The information needed to tell them apart is in the author's head at the moment of writing and
  gone by review.
- **Defer every correction into a successor artefact, reviewed as a batch.** Rejected: that is
  spec drift by construction, and it is the documented failure mode this decision answers.
- **Forbid in-flight edits to approved specs entirely.** Rejected: it makes an approved spec a
  fiction the moment implementation contradicts it, and it would have blocked all three of the
  corrections that made the 2026-08-31 plan usable.

## Reversal cost

Low. The rule lives in prose — this decision, the programme descriptor, and the skills that
author artefacts — and constrains no compiled contract. Reverting means deleting the requirement
to name what a correction touches.
