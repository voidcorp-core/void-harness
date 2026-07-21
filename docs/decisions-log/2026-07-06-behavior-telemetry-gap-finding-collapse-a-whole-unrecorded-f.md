---
date: 2026-07-06
title: "behavior `telemetry-gap` finding -- collapse a whole unrecorded firing kind, don't cry N dead-nodes"
---

## 2026-07-06: behavior `telemetry-gap` finding -- collapse a whole unrecorded firing kind, don't cry N dead-nodes

Context: three telemetry blind spots in a row (doctrine `activation`, workflow `scriptPath`,
`Agent` vs `Task`) were the same shape -- the recorder and the graph node derive their join
key independently and nothing checks they agree. Finding the fourth by accident is not a
strategy. The `Agent` bug in particular surfaced as five separate `dead-node` findings (one
per agent), which is exactly how it got misread as "these agents are under-used".

Decision: a compounding guard in the behavior kernel. When a whole `ActivationKind` has >= 2
firing-capable, non-`always` nodes but zero recorded activations, emit one `telemetry-gap`
finding (listing those nodes, pointing at the recorder) and suppress their `dead-node`
findings. A whole kind at zero is far more likely a join-key break than every component of
that type being independently dead.

Two design points. (1) Threshold >= 2: with a single node, "kind unrecorded" is
indistinguishable from a genuinely dead component, so a one-node kind stays a `dead-node`
(this is why the workflow kind, one node today, is not gap-covered -- acceptable, it gains
coverage the day a second workflow-def exists). (2) `always` nodes are excluded from the
count: they are exempt from dead regardless, so they are no evidence of a recorder break.
Rejected alternative: emit the gap *in addition to* the per-node dead-nodes -- that keeps the
noise the guard exists to remove. The guard self-extinguishes: once the recorder is fixed and
the kind records activations, the gap disappears and normal per-node analysis resumes.
