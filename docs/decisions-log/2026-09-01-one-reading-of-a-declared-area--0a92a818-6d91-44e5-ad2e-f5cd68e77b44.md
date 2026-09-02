---
schemaVersion: 1
id: "adr:0a92a818-6d91-44e5-ad2e-f5cd68e77b44"
createdAt: "2026-09-01T16:26:59.319Z"
title: "one reading of a declared area, in ordering and in the audit alike"
status: accepted
deciders: ["Folpe"]
supersedes: ["adr:77dbf251-b085-45ba-9b14-3008a6b07648"]
---

# one reading of a declared area, in ordering and in the audit alike

## Context

The decision this supersedes is right on substance: the reconciliation footprint audit refuses a
range for a file **another ticket of the cluster declared**, never for a file merely nobody
predicted. That rule stands, unchanged, and this decision restates it rather than replacing it.

Two of its supporting sentences did not hold, and a fresh adversarial review of the shipped diff
found both.

The first is the clause that a file two tickets both declared is in scope for both, "because
`orderWorkers` already sequenced them for that exact collision". `orderWorkers` compared areas by
exact string equality; `auditFootprint` matched by prefix and by glob. So `packages/cli/src` and
`packages/cli/src/lib/x.ts` were disjoint for the ordering step and nested for the audit: the two
tickets ran in parallel, and the second one's own neighbouring file was then refused as a breach on
the first's behalf -- by a clause whose stated justification had never been true for anything but
identically written areas. The justification was not decoration. It is the whole reason the
leniency is safe.

The second is the acknowledged negative that "a cluster whose planner emits no footprint at all
silently gets no audit". Measured against the shipped code, the word doing the damage is
*silently*: with no footprints the plan came back with an empty `excluded`, byte for byte what a
clean audit returns. Nothing distinguished audited-and-clean from never-audited. What fed the
footprints in was a sentence in a prompt addressed to a fresh sub-agent that had never seen them,
and `orchestrate` did not re-emit them, so the hand-off could not have been mechanical even by
intent -- and the most available way for that sub-agent to produce a list it lacks is to derive it
from the branch diff, which makes the audit tautologically green about the diff it came from.

A third defect belongs to the same family and had no ADR at all. `packages/core/templates/` -- the
most natural way to write a directory in a path list -- claimed nothing: not the exact path, not
the prefix, which would need a doubled slash, and picomatch matches no file against a trailing
slash either. A file stolen from that area came back `within-scope` and was reported as a widening,
which is the audit's own word for approval. The spelling of the thing being guarded disarmed the
guard.

## Decision

A declared area has **one reading**, in `footprint-area`, and every step that consumes an area uses
it: `orderWorkers` for who runs in parallel, `auditFootprint` for whose file is whose, and the
reconciler's strip step for the paths it owns. An area is normalised before it is read -- trimmed,
without a leading `./`, without a trailing `/` -- and an area that still claims nothing after that,
empty or absolute, is refused rather than silently matching no file.

Two areas contend when either claims the other, by exact path, by containing directory, or by glob.
That makes the superseded decision's clause true as written: a file two tickets both declared is in
scope for both **because ordering sequenced them**, and ordering now sequences every relation the
audit is willing to read.

The audit is not optional. A cluster of more than one ticket that reaches `reconcile` without a
declaration covering every one of its tickets is refused with `AUTOPILOT_CONTRACT`, and so is a
range whose observed file list is missing **or empty**. `orchestrate` returns the footprints it
ordered on, and the run's script hands them to `reconcile` as a value it holds rather than asking a
sub-agent to remember them. A cluster of one is not audited, because there is no other ticket to
rob and demanding an observation to answer nothing would stall a run for ceremony.

## Consequences

Positive:

- The clause that lets a jointly declared file through now rests on something true. Nested and
  glob-related areas are sequenced, which is what made the leniency safe in the first place.
- Absence of an audit is no longer shaped like a clean audit. It is a refusal that names the
  tickets whose declaration is missing.
- The guard can no longer be disarmed by how a human spelled a directory, and a spelling that
  claims nothing is refused loudly instead of passing as an empty claim.
- The hand-off from `orchestrate` to `reconcile` is a value the script carries. A prohibition that
  lives in a prompt is a prohibition the next fresh context may not receive -- the same principle
  the sibling decision applies to the worker brief, now applied to this guard's own switch.

Negative:

- Ordering is now more conservative: a ticket declaring a directory sequences every ticket
  declaring anything under it. Fewer parallel lanes, and the cost is wall clock on a cluster whose
  footprints nest. That is the honest price of the two steps agreeing, and the alternative was
  agreeing on paper only.
- Two areas that are both globs and match no literal form of each other still read as disjoint.
  This under-detects rather than over-detects, and the audit remains the backstop.
- Every reconcile observation must now carry `footprints`, even empty. An older caller is refused
  rather than silently unaudited, which is the point, but it is a breaking change to the step's
  input.

## Alternatives considered

- **State precisely why the two readings differ, and keep them different.** The review allowed it.
  Rejected because no honest statement exists: the ordering step's job is to prevent the collision
  the audit then punishes, and a preventer blind to a relation the punisher can see is not a
  design, it is a gap with a paragraph over it.
- **Make the audit read areas by exact equality, matching `orderWorkers`.** Cheaper, and it would
  also close the disagreement. Rejected: it deletes the directory and glob forms, which are how
  footprints are actually written, and a ticket declaring `packages/cli/src` would then claim only
  a path no commit ever touches.
- **Keep the audit gated on `footprints` being present, and fix only the plumbing.** Rejected for
  the reason the plumbing needed fixing: a guard whose absence is indistinguishable from its
  success is a guard nobody can prove ran, and the next regression restores the silence without
  changing a line of the audit.
- **Exclude every range of an undeclared cluster instead of refusing the whole plan.** Equally
  fail-closed and less abrupt. Rejected because a missing declaration is a caller contract failure,
  not a property of any one range: `buildReconcilePlan` already throws `AUTOPILOT_CONTRACT` for a
  bad cluster id and for an empty range list, and reporting this per range would invite reading it
  as something a rerun of that worker could fix.
- **Normalise areas at the ticket boundary rather than at read time.** Would put the one spelling
  in one earlier place. Rejected as unenforceable: areas arrive from a tracker, from a program
  descriptor and from a scaffolded observation, and a normaliser at the boundary is a normaliser
  something bypasses.

## Reversal cost

Low. `footprint-area` is one pure module with three consumers and no persisted output; loosening or
tightening the relation changes it and its tests. The mandatory audit is one condition in
`buildReconcilePlan` plus one required field in the reconcile input shape. Nothing durable is
written in the shape of either, and no artefact records a verdict.
