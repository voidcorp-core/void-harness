---
schemaVersion: 1
id: "adr:3fe8f586-943e-456c-b788-794ce20db3d3"
createdAt: "2026-09-02T14:21:27.134Z"
title: "A unit handed back is taken, not remaining, and it still measures"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# A unit handed back is taken, not remaining, and it still measures

## Context

Measured on 2026-09-02, run `run-2026-09-02-chain-a` of the `autonomous-until-develop` programme.
One unit was taken, DEV-703: worker 59 minutes, reconciled, union read clean, published, and handed
to a person with its required checks green. Nothing merged. At 84 minutes of 120,
`void-harness autopilot chain --for 2h` answered:

```
{"decision":{"kind":"continue","detail":"base green after 0 merge(s), 7 unit(s) ready, 36m left"},"nextUnit":"DEV-703"}
```

Two readings produced that answer, and both came from the same gap: the observation had one state
for a unit this run had taken, `merged`.

`decideChainStep` computed the remaining pool as `pool - merged`. A unit published and waiting for
a person is not merged, so it was remaining, and being first in the order it was proposed as
`nextUnit`. An obedient caller starts a second worker on a ticket whose pull request is open.

`planChainStep` projected the next unit against the cold estimate, fifteen minutes, because the
measurement that replaces it was `elapsedMs / merged.length`, and nothing had merged. The run had
measured 84 minutes for the only unit this repository had ever shown it, and the projection said
the next one fits in 36. The cold-run decision says the estimate serves "exactly as long as there
is nothing better"; here there was something better, and no field carried it.

The operator held the bound, stopped, and wrote the decision in the pull request body. That is the
inverse of what the chain exists to guarantee.

## Decision

The chain observation lists every unit the run took with what became of it -- `merged`,
`published-awaiting-human` or `blocked` -- and none of those states is remaining. The first unit
taken replaces the cold estimate, whatever its outcome, with the estimate kept as a floor under the
measurement. A run with a unit published and waiting for a person stops with `awaiting-human`
rather than starting another unit on the base that person has not accepted yet.

`merged` stays as the journal of merge evidence, and the two lists are cross-checked: a merged unit
absent from `taken`, or a unit claimed merged there without its evidence, refuses the step. The
same rule `reconcile` applies to `cluster` and `footprints`: two lists in one description that
disagree are a description nobody checked.

## Consequences

Positive:

- The real observation now answers `stop (budget-spent)`, from the unit it measured. The bound the
  unattended-run-is-bounded-by-time record claims holds on the run that first contradicted it.
- A unit handed to a person cannot be proposed again by the CLI, so the guard sits where the
  decision is made rather than in the operator's judgment.
- The disposition names a unit waiting for a person on its own line. "still ready: DEV-703" was
  the sentence that would have sent a relaunch back onto its own open pull request.
- The stop is ordered after the budget and before `nothing-ready`, on purpose. When both are true
  the budget is the reading that says why the run is over rather than merely paused; and a run
  that handed a unit to someone did not run out of work.

Negative:

- The observation carries one more list, and a caller that omits it is refused rather than served.
  Accepted: the field is the fact the two defects were missing, and an optional one would leave the
  operator holding the bound exactly as before.
- The floor means a project whose units genuinely finish under fifteen minutes still cannot chain
  ten-minute runs. Unchanged from the cold-run decision, and for the same reason: a unit blocked in
  two minutes measured how long failing takes, not how long finishing does.

## Alternatives considered

- **Fold `merged` into `taken` and carry the merge evidence on the merged entries.** One list, no
  cross-check. Rejected here because it rewrites the `merged` contract every existing caller,
  scaffold and journal renderer reads, for a gain the cross-check delivers without the churn. It
  remains the honest long shape if the observation is versioned again.
- **Keep `merged` as the only state and let the caller shorten the pool.** Rejected: that is the
  reading the run already had. A pool "minus what is done" filtered by a person is the operator
  holding the bound, and the failure this record describes.
- **Count only merged units as measurements, as the cold-run decision said.** Rejected: on
  2026-09-02 it projected fifteen minutes against a measured eighty-four. The cold-run decision is
  not superseded; its replacement rule is widened from "the first merge" to "the first unit taken".
- **Continue past a unit waiting for a person, on the base as it is.** Rejected: it stacks a second
  pull request on a first one nobody has read, and turns the one human gate into two merges to
  reason about at once.

## Reversal cost

Low. One field on the observation, one branch in `decideChainStep`, one stop reason and one
`Math.max` in `planChainStep`. Reverting restores a chain that proposes an open pull request as
the next unit, so the reason would have to be a better account of a taken unit, not the absence
of one.
