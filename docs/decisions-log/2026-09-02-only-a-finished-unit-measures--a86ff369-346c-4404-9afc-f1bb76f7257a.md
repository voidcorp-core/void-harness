---
schemaVersion: 1
id: "adr:a86ff369-346c-4404-9afc-f1bb76f7257a"
createdAt: "2026-09-02T20:28:16.293Z"
title: "Only a finished unit measures, and the estimate serves until one does"
status: accepted
deciders: ["Folpe"]
supersedes: ["adr:deec6845-b4cf-4e8f-a55d-227eb7046d4a","adr:3fe8f586-943e-456c-b788-794ce20db3d3"]
---

# Only a finished unit measures, and the estimate serves until one does

## Context

Two accepted decisions describe the per-unit projection in `planChainStep`, and they contradict
each other and the code.

The cold-run decision (`adr:deec6845-b4cf-4e8f-a55d-227eb7046d4a`) says the fifteen-minute estimate
is transient: "the first merge replaces that estimate with what this run actually spent", and
"every run that merges anything stops using it within one unit". The handed-back decision
(`adr:3fe8f586-943e-456c-b788-794ce20db3d3`) widened the replacement from "the first merge" to
"the first unit taken, whatever its outcome", kept the estimate "as a floor under the
measurement", and declared itself not a supersession. The code did what the second one said:
`Math.max(COLD_START_UNIT_MS, elapsedMs / taken.length)`, permanently.

Three artefacts then disagreed. The cold-run decision called the estimate transient while the code
kept it forever. The skill said "the cold estimate only ever serves a run that took nothing yet"
while the floor served every run. And the stop detail reported "each unit has taken about 15m" for
a unit the run had measured at two minutes, because the floor had replaced the measurement without
being named.

The average had a defect of its own, named in the union reading of `run-2026-09-02-chain-b`. With
`taken = [merged in 80 min, blocked in 2 min]`, 82 minutes elapsed and 130 declared, the
projection was 41 minutes per unit and the chain continued into 48 minutes against a unit this run
had finished in 80. The code's own comment said a unit blocked in two minutes "measured how long
failing takes, not how long finishing does", then divided by it anyway. The floor existed to cover
that case, and it covered only a run whose average fell below fifteen minutes.

## Decision

The per-unit projection is `elapsedMs` over the number of units this run FINISHED, where finished
means `merged` or `published-awaiting-human`. A `blocked` unit is not finished: it spent the run's
time, which stays in the numerator, and it is not a unit to divide by.

While nothing has finished, the run is projected against the fifteen-minute estimate, and the stop
detail names it as an estimate. From the first finish, the estimate is gone: there is no floor
under the measurement. A project whose units genuinely finish in five minutes measures five, and
chains a twelve-minute run.

What the handed-back decision established about the observation stands and is restated here so
that nothing accepted depends on a superseded file: the observation lists every unit the run took
as `taken`, with `merged`, `published-awaiting-human` or `blocked`, and none of those is remaining;
`merged` stays the journal of merge evidence and the two lists are cross-checked; a run with a unit
published and waiting for a person stops with `awaiting-human` after the budget is judged and
before `nothing-ready`. Only its measurement rule changes.

## Consequences

Positive:

- The two-unit case answers `stop (budget-spent)` naming 1h22m, from the unit that finished.
  The bound the unattended-run-is-bounded-by-time record claims holds against a failure that
  used to halve the measurement.
- The estimate is transient again, as the cold-run decision first said, and now for every
  outcome that finishes. A constant no longer becomes the model of a project it was never
  measured on.
- The stop detail is true in both regimes: it names the estimate when the estimate applied, and
  the measured duration when a measurement did.
- The negative consequence both earlier decisions carried, that a project with short units could
  not chain short runs, is gone with the floor.

Negative:

- A run that blocks on every unit never measures, and keeps being projected against fifteen
  minutes. Accepted: a run that finishes nothing has nothing to measure, and the estimate
  refusing to start a unit into eight minutes is the estimate doing its job.
- Fifteen minutes remains a judgement rather than a measurement, stated as such in the code.
  Unchanged; the constant was never the problem, its permanence was.

## Alternatives considered

- **Keep the permanent floor and supersede only the wording.** Rejected: it leaves the two-unit
  case continuing into 48 minutes against a unit that finished in 80. A decision that says what
  the code does would have to say that, and nobody would accept it once written down.
- **Average over every unit taken, floor removed.** Rejected: it is the 41-minute reading with the
  one guard that partly hid it taken away.
- **Measure over finished units, floor kept.** Rejected: once a blocked unit no longer dilutes
  the measurement, the floor guards nothing observed and forbids the short-unit project for no
  reason left standing.
- **Take an expected duration from the ticket.** Still the honest long answer, still out of
  scope: the observation carries unit ids, not estimates.

## Reversal cost

Low. One filter and one removed `Math.max` in `judgeBudget`, one sentence in the skill. Reverting
restores a chain that measures a failure as a unit, so the reason would have to be a better
account of what a blocked unit measures, not the absence of one.
