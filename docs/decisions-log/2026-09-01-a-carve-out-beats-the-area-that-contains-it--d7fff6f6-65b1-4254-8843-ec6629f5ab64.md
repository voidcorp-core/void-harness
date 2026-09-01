---
schemaVersion: 1
id: "adr:d7fff6f6-65b1-4254-8843-ec6629f5ab64"
createdAt: "2026-09-01T22:11:42.957Z"
title: "A carve-out beats the area that contains it, and the third reader of an area joins the other two"
status: accepted
deciders: []
supersedes: ["adr:0a92a818-6d91-44e5-ad2e-f5cd68e77b44"]
---

# A carve-out beats the area that contains it, and the third reader of an area joins the other two

## Context

The decision this supersedes is right on substance and this one restates it rather than replacing
it: a declared area has ONE reading, in `footprint-area`, and the reconciliation audit refuses a
range for a file **another ticket of the cluster declared**, never for a file merely nobody
predicted.

Two of its sentences did not survive a fifth adversarial review, and they are the same sentence
seen twice.

**The leniency's justification still did not hold.** The clause that a file two tickets both
declared is in scope for both was justified by "`orderWorkers` already sequenced them for that
exact collision". The superseded decision repaired one reader and declared the clause true as
written. It was not, for two reasons found by measurement.

First, sequencing does not compensate. Two sequential workers still hold two distinct worktrees on
the same base, and sequencing addresses lockfiles and migrations -- shared dev state no file list
describes -- never file theft. The stash stack this whole ticket comes from is shared by both
lanes either way.

Second, the leniency was wider than "both declared it". `owns()` answered first and short-circuited
before `claimedBy` was ever computed, so a wider declaration swallowed a narrower one. With DEV-1
declaring `packages/core` and DEV-2 declaring `packages/core/b`, a range of DEV-1 carrying
`packages/core/b/x.ts` returned `{kind: 'within-scope', widened: []}` -- verified. Not permitted:
invisible. The file DEV-2 explicitly carved out was not even reported as growth.

**And a third reader of an area was still comparing strings.** `cluster-plan` compared areas by
exact string equality while `worker-order` and `footprint-audit` both went through
`footprint-area`. Measured on the built binary with `packages/core` and `packages/core/skills`,
`plan` said parallel and `orchestrate` said sequential with `footprint-overlap`. `orderWorkers`
routes, so nothing executed wrong -- but the cluster plan is the artefact a human confirms, and it
described lanes the run never used. The one-reading decision had been applied to two readers out of
three.

## Decision

**A carve-out beats the area that contains it.** A file is a breach when another ticket claims it
through an area strictly narrower than every area of the range's own ticket that reaches it.
Strictly: the outer claims the inner's ground and the inner does not claim the outer's, so two
spellings of the same area -- and two globs neither of which contains the other -- remain a tie,
and a tie keeps the old reading that both tickets were entitled. Owning the file no longer ends the
question; the neighbours' claims are computed for every non-exempt file.

**Every reader of a declared area uses the one reading.** `cluster-plan` joins `worker-order` and
`footprint-audit` on `footprint-area`. Because that reading refuses an area claiming nothing by
throwing, and `cluster-plan`'s contract is that one malformed candidate must not deny the operator
the rest of the pool, it turns that one refusal into the typed cause `malformed-input`; anything
else still escapes.

## Consequences

Positive:

- The shape a human draws deliberately is now enforced. Writing `packages/core/b` next to a
  neighbour's `packages/core` is drawing a boundary, and the guard reads it as one.
- The invisible case is gone. A carved-out file taken by the containing ticket is a named breach
  with its claimant, not a `within-scope` verdict with an empty widening.
- The plan a human confirms describes the lanes the run will take. Three readers, one relation.

Negative:

- A ticket declaring a wide area beside a neighbour's narrow one inside it can no longer write in
  that carve-out without being refused. That is the intended narrowing, and it costs a rerun with a
  corrected declaration when the wide ticket legitimately needed the file.
- The audit's inner loop no longer short-circuits on ownership, so it computes the neighbours'
  claims for every file of every range. The lists are a run's file counts; the cost is not
  measurable against a merge.

## Alternatives considered

- **Treat any contested file as a breach.** The blunt reading of the same finding, and it produces
  a catastrophic false positive: the narrow ticket writing inside its OWN carve-out would be
  refused on behalf of the ticket whose wider area contains it -- refusing a ticket for doing
  exactly its job. Specificity is what separates a boundary from a tie.
- **Report contested files as a third verdict rather than a breach.** It removes the invisibility
  without refusing anything, but `reconcile` turns a verdict into merge or exclude, so a third
  state would be carried nowhere and read by nobody. A guard whose finding changes no outcome is a
  formality.
- **Leave `cluster-plan` on string equality since `orderWorkers` routes anyway.** Rejected: the
  human confirmation gate reads the plan, and consent given on a false picture of the lanes is the
  one thing that gate exists to prevent.

## Reversal cost

Low. Two pure modules and their tests; no persisted artefact carries either reading.
