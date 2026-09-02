---
schemaVersion: 1
id: "adr:f319d5d1-ab99-4e4e-a4c1-4ef6e212e9fb"
createdAt: "2026-09-01T22:11:35.463Z"
title: "The refusal for an undeclared footprint names no split, because a cluster of one audits nothing"
status: accepted
deciders: []
supersedes: ["adr:8a32c43f-e8c9-489b-bd04-368a81ebbdc3"]
---

# The refusal for an undeclared footprint names no split, because a cluster of one audits nothing

## Context

The superseded decision moved the refusal of an `areas: []` footprint from reconciliation to
selection, and that move stands. Its argument stands too, and a fifth adversarial review verified
it by execution: a ticket declaring nothing is already audited at maximum severity, because it owns
nothing, so every file its range carries is either a neighbour's declared file -- a breach -- or a
widening.

One sentence of it did not stand. `reconcile` keeps the refusal as a backstop for a hand-built
cluster, and to name a move the caller can make it offered: "reconcile each range as its own cluster
of one -- which is exactly the coverage such a ticket ever had."

The second half is false, and the first half of the same decision is what refutes it. The maximum
severity exists ONLY because the neighbour sits in the same cluster. The audit is armed by
`audited = inPlay.size > 1`; split into clusters of one, no range is confronted with any
declaration at all -- not the undeclared one, and not the ones that did declare.

Measured against the built binary, with DEV-1 declaring `packages/cli`, DEV-2 declaring `[]`, and
DEV-2's range carrying `packages/cli/a.ts`:

- the joint cluster refuses with `AUTOPILOT_CONTRACT` and prints that Fix line;
- following that Fix line integrates `[DEV-2]`, excludes nothing, and exits 0 -- the file DEV-1
  declared merges;
- the control, DEV-2 declaring `packages/core` instead, is refused as `footprint-breach` and named.

Same range, same theft, refused one way and integrated the other, with the CLI itself pointing at
the second path and promising it costs nothing. And the refusal is reached exactly where the theft
is likeliest: workers finished, run complete, a range possibly holding a neighbour's work.

## Decision

The refusal for `areas: []` names no split. It states what splitting costs -- no range is audited
against any neighbour's declaration any more -- and the move it names is not a command: declare the
areas and plan again, or, for a run whose workers already finished, read the whole diff of every
range by hand before any of it merges.

## Consequences

Positive:

- The guard no longer publishes its own bypass at the moment it matters most. A message that
  advises disarming a guard is part of the guard, and this one was reachable only at the end of a
  paid run.
- It closes the shortening leak the previous review flagged as next. Alone, that hole needed an
  agent to contradict two literal values handed to it verbatim; with this Fix line, obeying the
  binary was enough.
- The refusal is honest about what it cannot offer. An entitlement nobody declared cannot be
  reconstructed from the range under suspicion, because that range is the only surviving evidence,
  and deriving the declaration from it is the tautology the audit exists to forbid.

Negative:

- The backstop no longer ends in a command. For a hand-built cluster whose workers already
  finished, the remaining move is a human reading, which costs a person's attention rather than a
  rerun. Accepted: `plan` excludes such a ticket before any worker starts, so reaching this refusal
  already means the normal path was bypassed.

## Alternatives considered

- **Keep the split and name its cost.** The literal other half of the mandate. Rejected: an
  actionable-looking instruction and a disclaimer after it do not weigh the same to a reader under
  pressure at the end of a run, and the instruction would still be the CLI's own. A cost note does
  not stop being an invitation.
- **Exclude the undeclared range instead of refusing the cluster.** Already rejected on evidence by
  the superseded decision, and that rejection is unchanged: it preserves the neighbours' work but
  buys no protection, since what an empty declaration costs is the reverse direction -- a neighbour
  absorbing that ticket's work and having it read as an ordinary widening.
- **Arm the audit for a cluster of one.** It would make the split honest, but there is nothing for
  it to answer: with no other ticket, every observed file is a widening, and demanding an
  observation to answer nothing stalls a run for ceremony.

## Reversal cost

Low. The change is one refusal message and its test; nothing consumes its wording as a contract.
