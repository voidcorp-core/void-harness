---
schemaVersion: 1
id: "adr:15a25eab-0d33-4871-be96-b24d8b405389"
createdAt: "2026-09-01T19:51:31.788Z"
title: "A run description that contradicts itself is refused, not quietly trimmed"
status: proposed
deciders: []
supersedes: []

---

# A run description that contradicts itself is refused, not quietly trimmed

## Context

The footprint audit `reconcile` runs is armed by the tickets in play and judges a range against
what the OTHER tickets of the cluster declared. The previous decision on this branch
(`adr:2a41dbc1-b4c4-48b5-ab41-d72ec0e12905`) closed the case where `cluster` alone is shortened:
`cluster` and `footprints` are now cross-checked in both directions, so a list one entry shorter
than the other is a refusal.

It does not close shortening BOTH, consistently. Measured end to end through the CLI:

```
cluster:    ["DEV-1"]                                    // the run reserved DEV-1 AND DEV-2
footprints: [{ id: "DEV-1", areas: ["packages/cli/src"] }]
results:    [DEV-1 completed, DEV-2 blocked "stash collision"]
observed(DEV-1): ["packages/cli/src/a.ts", "packages/core/templates/PROJECT-DOCTRINE.md"]
=> { "integrate": ["DEV-1"], "excluded": [] }
```

Nothing is malformed and the two declared lists agree with each other. They are simply one entry
shorter than the run. With honest lists the same payload yields
`excluded: [{ DEV-1, footprint-breach }]`.

The proof of the shortening was in the same payload the whole time. `results` carries DEV-2's own
`WorkerResult`, and `observations` can carry DEV-2's range. `resolveClusterOutcome` dropped both in
silence, with a comment stating the good intention in the other direction: a runtime that
hallucinates a ticket id must not smuggle a branch into the merge. That intention is right, and
reading the same list one way only is what left the dangerous direction open. The previous
decision's own words -- "the proof of the under-declaration was in the same payload and nobody read
it" -- were still true, one notch deeper.

There is an asymmetry between the two runtimes that makes this reachable rather than theoretical.
On the Claude path the workflow script renders `cluster` and `footprints` from the orchestration
mechanically. The Codex adapter reference said nothing about the reconcile payload at all: no
`cluster`, no `footprints`. On that path the lists are written by a subagent, which is exactly the
seam where a shortened-but-consistent description comes from.

## Decision

`cluster` is cross-checked against every ticket the payload reports on -- `results`, `failures` and
the ranges git was read for -- and a ticket named by any of them and absent from `cluster` refuses
the reconciliation instead of being dropped.

## Consequences

Positive:

- The measured hole closes: the payload above now refuses, naming DEV-2 and the list that carried
  it, and the honest payload is unaffected.
- The refusal covers the invented-ticket direction the silent drop was written for, and covers it
  better: a hallucinated id no longer merges because nothing merges, rather than because one entry
  was filtered out while the rest proceeded on a description known to be wrong.
- The three lists of one payload now have one reading. `resolveClusterOutcome` no longer filters
  `results`, because the refusal above it is what makes every result a cluster ticket.
- The Codex adapter reference carries the contract in prose at the point where a subagent assembles
  it, so the guarantee is not only a CLI refusal the adapter never reads about.

Negative:

- A worker result so malformed that its `ticketId` is not even a string arrives as the sentinel
  `unknown`, which is not in the cluster, so it now refuses the whole reconciliation rather than
  excluding one ticket. Accepted: an answer the run cannot attribute to any ticket is a run
  description that does not hold, every branch is preserved, and the refusal names the sentinel.
- A caller assembling the payload from memory rather than from `orchestrate` will hit a refusal
  where it previously got a plan. That is the point, and the fix line says what to pass.
- `ClusterOutcomeInput` grows an optional `observed` field carrying ids only. The observation
  objects themselves stay out of this module; it judges the run description, not the ranges.

## Alternatives considered

- **Arm the audit from the union of every list instead of refusing.** Three lines, and it does
  exclude the contaminated range. Rejected for the same reason the previous decision rejected it
  one notch up: it audits a payload that contradicts itself and continues. A `cluster` missing
  DEV-2 also means the tracker lifecycle will not carry DEV-2 and the pull request body will not
  mention it. Auditing correctly on a run description known to be wrong is still merging on a run
  description known to be wrong.
- **Keep the silent drop and add the cross-check only in `buildReconcilePlan`.** Rejected: by the
  time the plan is built, `results` has already been filtered down to the cluster and the evidence
  is gone. The check has to happen where the three lists still exist together, which is the outcome
  step.
- **Refuse in `reconcileCommand`, in the CLI shell.** It is where the whole payload lands, so it
  looks like the natural place. Rejected: `resolveClusterOutcome` is exported and reachable without
  the command, and "every ticket reported on is a ticket the run reserved" is an invariant of the
  cluster outcome, not of the argv parser. The shell passes the observed ids down; it does not
  judge them.
- **Document it in the Codex reference and leave the code alone.** Rejected explicitly: this whole
  branch exists because a guarantee lived only as a sentence addressed to a fresh context. The
  prose is added AND the refusal is in the CLI both runtimes call.

## Reversal cost

Low. One pure function and one optional input field; deleting the call restores the previous
behaviour exactly, at the cost of reopening the hole it names. No artefact format changes, and a
payload a caller already assembles from `orchestrate` is unaffected.
