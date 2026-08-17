# Skill audit — `autopilot`

Distilled from `backlog-autopilot` (this repo), which it replaces at range D of the cutover.
Not a rename: the boundaries changed, and several capabilities were deliberately dropped.

## What was kept

- **The attended parallel burst.** A human confirms a bounded cluster, workers fan out in
  worktrees, the result is one integration PR. This is the part that demonstrably worked.
- **Worktree isolation as a hard rule**, including for sequential tickets. Filesystem
  isolation is real; a runtime's promise of isolation is not.
- **Human merge as the terminal gate**, unconditionally.

## What was dropped, and why

- **`--auto-merge`.** It existed behind a risk gate and was never the thing that made the
  feature useful. Merging is where a human reads the diff; automating it removes the only
  step where the batch is understood as a whole. Refused on every code path now, not merely
  defaulted off.
- **The headless / `claude -p` backend.** The deleted `autonomous-backlog-loop` ran
  out-of-session and lost MCP, connector and subscription inheritance — the very things that
  let a worker read the ticket it is implementing. Reserved, not carried over.
- **The streaming surface and the per-cluster progress rendering.** They described the run
  instead of proving it. The run state and the worker proofs do that now.
- **Cluster auto-detection by Linear graph edges.** An epic buckets unrelated work, so a graph
  edge alone never justified fusing two tickets into one PR. Range A ships one cluster of
  independent tickets; logical clusters stay possible but unproven.

## What is new

- **A review budget** that shrinks the cluster from structural doubt (unknown footprint, low
  confidence, collision zone) and never from the tracker estimate. Rationale: this board is
  mostly `L`, so a points veto would make autopilot single-ticket without measuring risk.
- **A logically atomic lease** with re-observation and compensation, replacing the previous
  implicit assumption that a tracker write that returned is a tracker write that landed.
- **The prohibition on remote effects expressed in the orchestration plan**, not only in the
  prompt. A prompt can be dropped, summarised or ignored; the artefact the adapter reads
  cannot.

## Boundary with `ticket-runner`

Autopilot owns selection, isolation, ordering and reconciliation. `ticket-runner` owns
everything that happens to one ticket. The overlap is deliberately zero: no pass of the
quality cycle is restated here, so the two cannot drift into two standards.
