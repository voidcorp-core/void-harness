---
schemaVersion: 1
id: "adr:2a41dbc1-b4c4-48b5-ab41-d72ec0e12905"
createdAt: "2026-09-01T17:47:27.503Z"
title: "a guard armed by one list is a guard that list can turn off"
status: accepted
deciders: ["Folpe"]
supersedes: ["adr:0a92a818-6d91-44e5-ad2e-f5cd68e77b44"]
---

# a guard armed by one list is a guard that list can turn off

## Context

The decision this supersedes is right on substance, and this one restates its rule unchanged: the
reconciliation footprint audit refuses a range for a file **another ticket of the cluster
declared**, never for a file merely nobody predicted, and a cluster of more than one ticket cannot
reach `reconcile` without a declaration.

What it got wrong is where the switch lives. It wrote that guarantee as "a cluster of more than one
ticket", and the code wrote it as `input.cluster.length > 1` -- one list, supplied by the caller,
read before anything cross-checks it. The cross-check that followed ran in one direction only:
every ticket of `cluster` needed an entry in `footprints`, and no entry of `footprints` needed a
ticket in `cluster`.

So the guard was disarmed by making the payload *smaller*, which nothing was looking for. A run
reserves DEV-1 and DEV-2, DEV-2 is blocked, DEV-1 absorbs its work through the shared stash. The
reconcile step passes `cluster: ["DEV-1"]` -- the tickets that came back, which is the most natural
list to assemble and the one everything else in that context is about. `footprints` still carries
both, verbatim from `orchestrate`, as the script hands it over. Measured on the shipped code with
an executed probe: `integrate: ["DEV-1"]`, `excluded: []`. That empty `excluded` is byte for byte
what a clean audit returns, and the superseded decision was accepted precisely to remove that
ambiguity.

The aggravating detail is that the contradiction was already in the payload. `resolveClusterOutcome`
drops any `WorkerResult` whose ticket is not in `cluster`, so the reconcile step received DEV-2's
footprint and DEV-2's result and used neither to doubt a `cluster` naming only DEV-1. The only
thing between the shrunk list and a contaminated merge was a sentence of prose in the input shape
-- "EVERY ticket the run reserved, not only those that came back" -- addressed to a fresh
sub-agent. The Claude runtime does pass the assignments mechanically; the Codex adapter is a prose
page with no script, and the CLI is a public contract anyone may drive by hand.

Three smaller failures of the same family were found with it, each a guard that fails open rather
than loudly:

- `observedFiles` arriving as a **string** rather than a list. It has a `length`, so it survives
  every emptiness check, and `for...of` then walks it character by character; no character matches
  an area, so the audit answers `within-scope`. A list of numbers merely throws a `TypeError`,
  which is at least fail-closed. Only the string reads as approval.
- A footprint declaring `areas: []`. The ticket owns nothing, so nothing can be stolen *from* it:
  every neighbour walking into its ground is reported as a widening, which is the audit's own word
  for approval.
- Two more area spellings that claim nothing: an internal double slash (`packages//core/templates`)
  and a `..` segment. Both pass the emptiness and absoluteness checks and match no path git ever
  reports. This is the trailing-slash defect of the superseded decision, in two spellings it did
  not cover.

## Decision

**The audit is armed by every ticket in play, and the two lists that name them are checked against
each other in both directions.** Tickets in play are the union of `cluster` and the ids in
`footprints`. When more than one is in play: a cluster ticket that no footprint declares is refused
with `AUTOPILOT_CONTRACT`, and so is a footprint naming a ticket the cluster says it never
reserved. Neither list can shrink its way out of the guard, because shrinking either one is now the
contradiction that raises the refusal.

Both directions refuse rather than repair. The two lists disagree and neither says which of them is
wrong; guessing would pick a merge over a question.

An entry declaring `areas: []` counts as no declaration. `plan` deliberately tolerates an unknown
footprint -- it costs the ticket a review unit and its parallel lane, and the footprint may still
be discovered while the ticket runs. By reconciliation the declaration is final, and a ticket
claiming nothing cannot be robbed.

**A file list is what git reported, or the audit answers nothing.** `auditFootprint` refuses
anything that is not an array of non-empty strings, and `buildReconcilePlan` excludes such a range
as `footprint-unobserved`, alongside the missing and the empty list it already excluded.

**An area carrying an empty or a dot segment claims nothing and is refused**, next to the empty and
the absolute area already refused: `packages//core`, `../x` and `a/./b` all read as ordinary areas
and match no path git reports.

## Consequences

Positive:

- The switch can no longer be flipped by the caller. Arming reads both lists, and every way of
  making one of them smaller than the truth is a named refusal rather than a quiet exemption.
- The contradiction that was already sitting in the payload is now read. A reconcile payload
  carrying a footprint for a ticket its `cluster` omits stops the run and names the ticket.
- The prose in the input shape is no longer load-bearing. The Codex adapter, which has no script to
  assemble the payload, is held by the same refusal as the scripted Claude path.
- `within-scope` stops being reachable from a malformed observation, so the audit's one word for
  approval is only ever produced by an actual reading.

Negative:

- A run whose cluster holds a ticket with no declared area now dies at reconciliation, after all
  the work, rather than at planning where the emptiness is first visible. Accepted: the branches
  are preserved, nothing is lost but the reconcile step, and the refusal names the ticket and the
  fix. Refusing it at `plan` instead would change cluster selection for every run, which is a
  separate decision and a separate ticket.
- `plan` and `reconcile` now read `areas: []` differently -- a cost signal there, a refusal here.
  That is deliberate and stated in both places: unknown at planning is a footprint that may still
  be discovered, unknown at reconciliation is a ticket nobody can protect.
- An area written `packages//core` used to be accepted and silently claim nothing; it is now a hard
  refusal. That is the intent, and it can stop a run whose ticket carries that typo.

## Alternatives considered

- **Arm on `Math.max(cluster.length, footprints.length) > 1` and audit anyway.** Three characters,
  and it does close the measured hole: the audit turns on and the contaminated range is excluded.
  Rejected as the whole fix, because it accepts a payload that contradicts itself. A `cluster`
  missing DEV-2 is not only an audit problem: `resolveClusterOutcome` has already dropped DEV-2's
  result, and the tracker lifecycle will not carry it. Continuing quietly would merge on a run
  description known to be wrong. The union is kept as the arming rule -- it is what makes the
  refusal reachable -- but the outcome is a refusal, not a silent audit.
- **Validate the payload shape harder in `validateAgainstShape`.** It checks that `observations` is
  an array and stops there, so deepening it would catch the string `observedFiles` at the CLI
  boundary. Rejected as the only fix: `buildReconcilePlan` and `auditFootprint` are exported and
  reachable without that validator, and the invariant "a file list is an observation" belongs to
  the module that decides on it, not to the parser upstream of it. Nothing prevents doing both
  later.
- **Refuse `areas: []` inside `auditFootprint`.** It is where the module comment complains about
  empty claims, so it looks like the natural place. Rejected: the audit's behaviour for a ticket
  that declared nothing is already correct and deliberately tested -- everything foreign to it is a
  breach, which is fail-closed for its own range. What is wrong is admitting such a ticket into an
  audited cluster at all, and that is a cluster-level judgement, so it lives with the other
  cluster-level refusal.
- **Leave the prose contract and rely on the runtime scripts.** Rejected: the Codex adapter has no
  script, `npx voidharness autopilot reconcile` is a public command, and the incident this whole
  branch is about is precisely a guarantee that existed only as a sentence addressed to a fresh
  context.

## Reversal cost

Low. Every part is a refusal in a pure function with a test that bites; removing one restores the
previous behaviour exactly, at the cost of reopening the hole it names. Nothing persists, no
artefact format changes, and a payload a caller already assembles correctly is unaffected.
