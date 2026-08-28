---
schemaVersion: 1
id: "adr:053e6114-d596-4ef5-bb2d-7109bcaa4533"
createdAt: "2026-08-28T23:41:05.716Z"
title: "The union is read before it merges; a human reads it where production is next"
status: proposed
deciders: []
supersedes: ["adr:911e4259-d82c-4039-a440-3e611d5c6f3b"]
---

# The union is read before it merges; a human reads it where production is next

## Context

The record this supersedes stated the principle sharply: no diff a human has not
read merges itself. It kept the `autopilot` refusal in code because that is the
path where the temptation is real, and allowed exactly one exception, the
back-merge, whose bytes a human had approved minutes earlier.

Two things have changed since.

**The reading that matters is not the one we assumed.** The harness now enforces
a floor at write time -- no `any`, no console, no secret, TDD order -- and a
per-ticket cycle that no human review reproduces. An audit of this repository
found six real defects, and every one of them passed every gate: an install
receipt attesting writes that never happened, a concurrency test asserting a
guarantee it did not measure, two commands using the word "wired" with two
different meanings, an error naming sixteen agents that were present. Not one is
a cleanliness problem, and not one would have been caught by reading a diff for
style. Raising the floor did not remove the danger; it changed its nature, from
typos to false claims.

**What a whole-diff reading actually catches is coherence.** The third of those
defects is the shape: two modules, each locally correct, disagreeing about a
word. No worker can see it, because each one is right. Only the union shows it.
That is the thing a human read of an integration pull request was really
providing, and it is a question a machine can be asked -- the audit that found it
was itself a pass with a different question, not a person.

Against that, the cost of keeping the human gate on every integration is real:
it does not scale past a cluster or two, it is where a robot's throughput stops,
and a human asked to read every cluster diff learns to click through them, which
destroys the gate on the pull requests that carry a consequence.

## Decision

The principle survives and the reader changes. No union merges without being
read. A human reads it where production is the next step; an adversarial
fresh-context pass reads it everywhere else.

Concretely, an integration pull request may merge itself only when both hold:

1. production is not downstream of this merge -- the target is an integration
   branch, never the branch that deploys;
2. the union has been read: a fresh-context pass over the whole integrated diff,
   instructed to refute rather than confirm, returned a verdict, and the verdict
   is clean.

The promotion of the integration branch to the production branch stays a human
action, and what the human judges there is the feature, not the code.

**The two halves ship together.** Granting condition 1 before condition 2 exists
removes a reading and replaces it with nothing, which is the only genuinely
dangerous move in this record.

## Consequences

Positive:

- The throughput ceiling moves off the human. A cluster integrates without
  waiting on a reading whose value the floor has already largely absorbed.
- The reading that remains is the one worth a person: does this feature do what
  we wanted, seen running, one step before it reaches users.
- The coherence question gets a named owner for the first time. It was nobody's
  before -- no worker sees the union, and a human reading for style was not
  looking for it.

Negative:

- A diff that is poor but passing lands on the integration branch with no human
  eye on it. The compensation is that the integration branch is testable in
  near-production conditions before the promotion, and the promotion is gated.
  That covers the runtime risk; it does not fully cover the taste risk, and this
  record does not pretend otherwise.
- The machine reader is wrong in ways it cannot see. Mitigated, not removed, by
  the two properties that make it a reader rather than a rubber stamp: fresh
  context, so it inherits no belief from the workers, and an adversarial
  instruction, so a pass that finds nothing has failed to refute rather than
  succeeded in confirming.
- "Auto-merge" now applies to a path carrying real work, which the previous
  record deliberately kept it away from. The boundary is no longer a mechanism
  ban but a pair of conditions, and conditions can be misread. Both are
  mechanical, which is the answer: a target branch is a name, a verdict is an
  artifact.

## Alternatives considered

- **Keep the human on every integration.** Rejected: it caps the whole system at
  one person's reading rate, and the reading it buys is the one the enforcement
  floor already does better. It also degrades on its own -- a person asked to
  read everything reads nothing.

- **Auto-merge on a branch-name condition alone.** Rejected, and it is the
  tempting shortcut, because it is one line. It removes the reading rather than
  reassigning it, and the failure it invites -- an incoherent union merged
  because no one and nothing looked at it whole -- is exactly the class the audit
  found.

- **More reviewers per worker instead of one reader of the union.** Rejected: it
  scales the wrong axis. Every worker being more thoroughly reviewed does not
  make two correct workers agree with each other, which is the defect being
  guarded against.

- **Let the human read the union asynchronously, after the merge.** Rejected: a
  reading with no gate behind it is a report, and a report nobody must act on is
  where findings go to be filed.

## Reversal cost

Low. The conditions are evaluated in the deterministic core, so removing the
grant restores the previous behaviour with no migration and no state to unwind.
The coherence pass keeps its value either way -- it is a review pass, not a
merge mechanism -- so reverting the merge grant does not waste it.
