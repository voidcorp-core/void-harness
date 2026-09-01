---
schemaVersion: 1
id: "adr:deec6845-b4cf-4e8f-a55d-227eb7046d4a"
createdAt: "2026-09-01T08:19:27.150Z"
title: "A cold run projects its first unit against an estimate, and replaces it with a measurement"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# A cold run projects its first unit against an estimate, and replaces it with a measurement

## Context

`planChainStep` refuses to start another unit when the time left is less than what a unit has
taken in this run: `remaining < elapsedMs / merged.length`. It is the rule that makes the
unattended-run-is-bounded-by-time record true, because a unit already under way is never cut in
half, so the only moment a run can honour its budget is the moment it decides to start one.

The projection sat behind `merged.length > 0`. The first unit of a run therefore faced no
projection at all, and `run autopilot for 1m` -- a shortening the invocation explicitly allows --
started a unit that takes the better part of an hour. The record says "a run cannot exceed what was
declared for it", and the run exceeded it by two orders of magnitude on its very first decision.

The reason the guard was written that way is real: a cold run has nothing to project from. There is
no per-unit measurement until a unit has finished, and the descriptor declares no expected duration.

## Decision

A cold run projects its first unit against `COLD_START_UNIT_MS`, fifteen minutes, and the first
merge replaces that estimate with what this run actually spent.

The estimate is named as an estimate and placed deliberately low. Its job is to refuse a run that
cannot possibly finish a unit, not to second-guess a run that might: a unit owes a full TDD cycle, a
review pass and the whole declared verify suite before it merges, and nothing in this repository has
come in under a quarter of an hour. Fifteen minutes therefore refuses `1m`, `5m` and `10m`, and
leaves every run anyone has actually asked for untouched -- the declared default is two hours.

## Consequences

Positive:

- The bound the record claims now holds on the decision that mattered most, the first one. A budget
  is a ceiling from the start of the run rather than from its second unit.
- The refusal is legible: it names the time left and the estimate it was compared against, so a
  person who meant to run for a minute learns why nothing happened instead of watching a unit start.
- The estimate is transient. Every run that merges anything stops using it within one unit, which is
  what keeps a constant from quietly becoming the model.

Negative:

- Fifteen minutes is a judgement, not a measurement, and this repository has no recorded unit
  duration to derive it from. It is stated as such in the code rather than dressed up.
- A project whose units are genuinely shorter than fifteen minutes cannot run a ten-minute chain.
  Nothing observed suggests such a project exists here, and the fix if one appears is a declared
  duration, not a lower constant.

## Alternatives considered

- **Leave the first unit unprojected.** Rejected: it is the defect. It makes the budget a ceiling
  that starts applying only after the run has already overrun it once.
- **Derive the estimate from `chainBudget` divided by `clusterSize`.** Attractive because both are
  declared, and wrong: `clusterSize` bounds how many units a cluster admits at once, not how many a
  run gets through. A programme declaring `clusterSize: 1` would refuse every run shorter than its
  whole budget.
- **Take an expected duration from the ticket.** The honest long answer, and out of scope here: the
  chain observation carries unit ids, not estimates, and a tracker point is not a duration. It would
  widen the input contract for a guard that only needs to catch the impossible case.
- **Refuse short budgets at parse time instead.** Rejected: `parseChainBudget` cannot know how long
  a unit takes in the project it is parsing for, and a floor on the duration would refuse a
  legitimate `10m` status run as readily as an impossible `10m` chain.

## Reversal cost

Low. One constant and one branch in `planChainStep`. Reverting restores a run that overruns its own
declared budget on its first decision, so the reason would have to be a better projection, not the
absence of one.
