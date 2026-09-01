---
schemaVersion: 1
id: "adr:8a32c43f-e8c9-489b-bd04-368a81ebbdc3"
createdAt: "2026-09-01T21:06:58.330Z"
title: "A footprint that names no area is refused at selection, not at reconciliation"
status: accepted
deciders: []
supersedes: []
---

# A footprint that names no area is refused at selection, not at reconciliation

## Context

Two readers of the same value disagreed about what it meant.

`planCluster` treated `areas: []` as a first-class state: the ticket was admitted, priced one
extra review unit as `unknown-footprint`, and given a sequential lane. `orderWorkers` already read
it the other way, fusing an absent entry and an empty one into the same `unknown-footprint`.
`requireSymmetricDeclaration`, at reconciliation, read it as no declaration at all and refused the
**whole cluster**.

Driven end to end against the built binary, a two-ticket pool where one footprint named no area
planned cleanly, orchestrated cleanly, ran both workers to a green committed branch, and then died
at the last step with `AUTOPILOT_CONTRACT`, exit 2. The refusal's own Fix line said to pass
`footprints` exactly as `orchestrate` returned them, which is precisely what had just been done:
`orchestrate` emits the areas verbatim, empty list included. The two remaining moves were both
forbidden by design -- invent an area for the ticket, which is the tautological derivation the
audit exists to forbid, or drop the ticket from `cluster`, which `requireClusterCoversRun` refuses
as soon as that ticket has returned a result.

So a whole run was payable and unsalvageable, and the disagreement, not the refusal, was the
defect.

## Decision

`planCluster` excludes a ticket whose footprint names no area with the cause `missing-footprint`,
the same cause and the same unconditional refusal already applied to a ticket the estimator
produced no entry for at all.

## Consequences

Positive:

- The two spellings of "nobody knows what this ticket touches" now get one answer, from the reader
  that is cheapest to obey: before a lease, before a worktree, before a token is spent.
- The exclusion is honest about the reason. Autopilot routes on footprints; a ticket naming no
  ground gives it nothing to route on, and no downstream step can recover coverage for ground
  nobody named. The reconciliation refusal never bought protection, it only arrived late.
- `reconcile` keeps the refusal as a backstop for a hand-built cluster, but it is now split in two
  so each names a move the caller can actually make: an absent entry says to pass what
  `orchestrate` returned, an entry declaring nothing says to name the areas and plan again, or to
  reconcile each range as its own cluster of one -- which is exactly the coverage such a ticket
  ever had.

Negative:

- A ticket with no declared footprint can no longer be drained by autopilot, even alone. It is run
  through `void-implement` directly, or its areas are named. This is a real narrowing, accepted
  because the absent-entry case was already refused on exactly those terms.
- `unknown-footprint` disappears from `cluster-plan`'s `SequenceReason`, since a ticket that would
  carry it never reaches the partition. `review-budget` keeps pricing it and `worker-order` keeps
  sequencing on it: both are separately callable pure modules whose own contracts still describe
  the state, and `orderWorkers` still meets it when a footprint is absent from its map.

## Alternatives considered

- **Refuse in `orchestrate` instead.** The same refusal one step later, after the human confirmed
  the cluster and the lease was taken, and with a coarser instrument: `orchestrate` has no
  per-ticket exclusion vocabulary, so it would throw the cluster away rather than drop one ticket.
  Strictly worse than the same decision made at selection.

- **Exclude that one ticket at `reconcile` (a new `footprint-undeclared` reason).** Rejected on
  evidence rather than taste. It preserves the neighbours' work, but it buys no protection, and
  the premise that it does is wrong: an undeclared ticket's own range is already audited, and at
  maximum strictness -- it owns nothing, so every file it carries is either a neighbour's declared
  file, which is a breach, or a widening. What an empty declaration actually costs is the reverse
  direction, a neighbour absorbing that ticket's work and having it read as an ordinary widening,
  and excluding the undeclared range changes nothing about that. So the option pays for a finished
  ticket's whole cycle to gain nothing, and hides the growth it was meant to expose.

- **Accept `areas: []` at reconciliation and drop the refusal entirely.** Consistent with the
  selector as it stood, and it would have made the observed run complete. Rejected because it
  keeps a permanent hole -- a ticket's ground unprotected for the length of the run -- in exchange
  for admitting work autopilot cannot route anyway.

## Reversal cost

Low. The rule is one screening branch in `planCluster` and one refusal message in
`reconcile-plan`, both covered by tests that state the intent. Re-admitting an unnamed footprint
means deleting the branch and restoring the sequencing reason; nothing is written, migrated, or
published on the strength of this choice.
