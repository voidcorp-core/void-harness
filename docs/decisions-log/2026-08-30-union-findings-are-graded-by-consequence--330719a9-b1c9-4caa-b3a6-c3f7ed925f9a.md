---
schemaVersion: 1
id: "adr:330719a9-b1c9-4caa-b3a6-c3f7ed925f9a"
createdAt: "2026-08-30T08:21:49.274Z"
title: "A union finding is graded by consequence, and only a blocking one stops the merge"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# A union finding is graded by consequence, and only a blocking one stops the merge

## Context

The union-is-read-before-it-merges decision put an adversarial reading between an
integrated cluster and its merge. It works: the reading finds real things no
worker could see. What it could not do was say yes.

`UnionVerdict` was `clean | contradicted | inconclusive`, and any contradiction
produced `contradicted`, which refused. Nothing distinguished consequences. A
machine merge reaching production and a sentence in a skill that a test matches
loosely were the same verdict.

That interacts badly with the instruction, which is the part that makes the pass
worth having: *try to refute this diff*. A reader told to refute finds something.
On a diff touching a skill, a spec and two decision records, it finds a lot, and
none of it is invented.

Measured on PR #296 on 2026-08-30. Two readings, eight then twenty-two
contradictions. Every one of them was real and reproducible; the second reading
included probes. Exactly one -- a branch-name comparison that let a machine merge
into the branch that deploys -- was dangerous. The pull request could only be
closed by arbitrating outside the mechanism, with the criterion "block only what
makes the system wrong or dangerous", which existed nowhere in the code. The
session cost was several hours on a merge that had been expected to take minutes.

A gate that cannot return `clean` on a doctrine-sized change does not gate. It
stalls, and a stalling gate is one people learn to route around -- which loses
the reading entirely, not just its false positives.

## Decision

Every contradiction carries a `severity`, `blocking` or `advisory`. Only a
blocking finding refuses the merge. An advisory travels with the grant, is
reported, and becomes a ticket.

The severity is not asked for as a judgement. The reader answers three closed
questions about consequence, and a finding is blocking if and only if at least
one is yes:

1. does it let the system do something it declares it refuses?
2. does it make a shipped artifact state the opposite of what the code does?
3. does it break something that worked before this diff?

Anything unusable in the `severity` field -- absent, misspelled, of the wrong
type -- reads as `blocking`, so a malformed answer cannot buy a pass.

Two readings that disagree with themselves refuse, in both directions: `clean`
carrying a blocking finding, and `contradicted` naming no finding at all.

The reading stays **one** pass. Its value is a fresh context over the whole diff,
not a panel.

## Consequences

Positive:

- The gate can say yes. The same reading that refuses a dangerous union lets an
  ordinary one through, which is what makes it survivable on every cluster.
- Small findings stop being lost. They were previously either blocking or, once
  someone arbitrated past them, silently dropped. Now they are carried and
  counted.
- Two answers that contradict each other refuse instead of being half-read. That
  closes the case where a reader answered `clean` while listing what it broke,
  and the list was never consulted.

Negative:

- The reader grades the finding that gates the merge. That is the structural
  weakness, and the closed questions are the mitigation, not a proof: a reader
  determined to block can still answer yes to question (1) about an action it
  never names. The refusal detail carries the finding, so a person can see it.
- A blocking finding wrongly graded advisory merges. The compensating fact is
  that this was already the outcome whenever a human arbitrated past a
  `contradicted` verdict -- the difference is the grade is now recorded and
  reviewable rather than made once, in a session, by whoever was tired.
- The three questions are a judgement about what matters, and they will age. A
  new class of consequence -- a cost blowup, a privacy leak -- fits none of the
  three cleanly.

## Alternatives considered

- **Keep the binary verdict, narrow the question**: instruct the reader to report
  only what is wrong or dangerous. Rejected: it loses the small findings instead
  of routing them. On #296 that is eighteen real, verified observations that
  would have been discarded rather than filed. The union pass is the only one
  that sees the whole diff, so a finding it makes and does not report is that
  pass wasted.

- **More severity levels** (critical / major / minor / nit). Rejected: the extra
  levels do not change any decision -- the merge either stops or it does not --
  and every added level is another dimension for a reader to inflate. Two levels
  map exactly onto the one binary outcome that exists.

- **Have a second reader grade the first one's findings.** Rejected as the
  expensive version of the same problem: the grader has the same incentive to be
  cautious, and it doubles the cost of the pass to arbitrate a scale rather than
  to find defects. It also reintroduces the panel this record deliberately keeps
  to one reading.

- **Let a human grade every finding.** Rejected: that is the arrangement being
  replaced. It caps throughput on one person's reading rate and degrades on its
  own, because a person asked to triage twenty findings per cluster learns to
  wave them through.

## Reversal cost

Low. The severity is one field on a parsed structure and one branch in a pure
function; treating every finding as blocking again is a two-line change with no
state to unwind. What a reversal would not recover is the readings already
performed under the graded contract, whose advisories were filed as tickets
rather than fixed in place -- and those tickets remain, which is the point.
