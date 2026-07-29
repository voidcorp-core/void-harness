---
name: autopilot
description: Use to drain a bounded cluster of independent ready tickets, each run end-to-end by ticket-runner in its own worktree, reconciled into one integration PR a human merges.
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: pretooluse
    codex: pretooluse
    hermes: ci-only
eval_targets: [claude/anthropic/opus]
---

# autopilot

Take up to four independent ready tickets, work each one properly, hand back a single
integration PR. You stay the merge gate.

> **In construction.** Range A (planner, active-program contract, tracker lease, run state)
> and range B (worker contract, worktree fan-out) exist. Reconciliation, the public command
> and the removal of `backlog-autopilot` land in ranges C and D. Until then the installed
> surface is still `backlog-autopilot`.

**Attribution**: see `.source`.

---

## What this skill does NOT do

It owns no ticket cycle. Every worker runs the canonical `ticket-runner` skill, whole, once
per ticket. If you find yourself writing "then the worker runs the tests, then reviews…"
inside autopilot, stop: that behaviour has one owner, and duplicating it means the two copies
drift and tickets get a different standard depending on how they were started.

It also never merges. Not with a flag, not when the checks are green, not when the diff is
small. `mergeGate: human` is the only value the active program accepts.

---

## The layers

**L0 — this skill.** Reads the connectors, hydrates observations, calls the CLI, applies the
action plans it gets back, re-observes, and persists nothing itself except through the CLI.
It is the only layer allowed to talk to the tracker.

**The CLI — `void-harness autopilot`.** Pure computation: selection, review budget, lease
protocol, run state, next action. It contacts nothing — no tracker, no GitHub, no git — and
spawns no agent. Every input and output carries `schemaVersion: 1`.

**The adapters.** Claude executes the orchestration plan with its Workflow primitive, Codex
with native subagents. Both read the *same* `OrchestrationPlan` and return the *same*
`WorkerResult`. An adapter that is missing, or a permission that cannot be proven, returns
`unsupported-runtime` before any tracker mutation.

**The workers.** One ticket, one worktree, one branch, one full `ticket-runner` run.

---

## The cycle

1. **Preflight.** Prove the runtime adapter, the connectors, git permissions, the base branch
   protection and worktree creation. All of it, before the lease. A capability discovered
   missing halfway through leaves a claimed cluster nobody is working.
2. **Plan.** Pipe the candidate observation into `autopilot plan`. Four is a ceiling, not a
   quota: the review budget shrinks the cluster when footprint, confidence or collision risk
   would make one PR unreviewable.
3. **Confirm with the human.** Show the cluster, the lanes, the exclusions and their causes.
4. **Lease.** Apply the ordered actions the CLI returns, then **re-observe every ticket**.
   The lease is active only when all of them converged. Partial convergence releases what was
   taken — half a cluster produces an integration PR that can never be complete.
5. **Create the worktrees.** The controller creates every worktree and branch before any
   spawn, including for sequential tickets. A worker never chooses its own checkout and never
   works in the main one.
6. **Fan out.** Parallel where footprints are disjoint and confident; sequential for overlap,
   low confidence, lockfiles, migrations and shared-ownership files. A migration is never
   parallel, whatever the estimate says.
7. **Collect.** Parse every result against the schema. Prose is not a result. A worker that
   was interrupted after committing is re-observed through its git ref, never replayed blind.
8. **Reconcile** (range C). One integration branch, the full suite, one PR.

---

## What a worker is given, and what it may do

Given: exactly one ticket id, one worktree path, one branch, and the paths of the global plan
and spec. It re-fetches the complete ticket itself — never work from a summary.

May: run every `ticket-runner` pass whose predicate fires, run its own targeted gates, apply a
migration **in dev/local only**, and commit a bisectable range.

May not: push, open or update a pull request, merge anything, move the ticket to In Review or
Done, or touch a file the plan marks `reconcileOnly`. These are denied in the orchestration
plan itself, not only in the prompt, so an adapter that honours the plan cannot grant them.

---

## Red flags

| Rationalization | Reality |
|---|---|
| "The worker can just push its branch, it is faster" | Workers are commit-only. A pushed worker branch triggers CI on work that has not been reconciled. |
| "Both tickets touch different folders, run them in parallel" | Different folders, same lockfile is still a collision. The partition decides, not the intuition. |
| "The tracker write probably worked, carry on" | A write with an unknown result is unknown. Re-observe; never conclude from a request that timed out. |
| "Only one ticket failed, ship the other three" | That is exactly right — and it is what partial success does. But the failed one keeps its branch and its blocker. |
| "The cluster is only three tickets, skip the review budget" | The budget is what shrank it to three. |
| "Autopilot should run the tests too" | `ticket-runner` runs them. Autopilot runs the full suite once, at reconciliation, on the integrated branch. |

---

## Composition

Upstream: `harness:ticket-writer` authors the tickets and the active program pointer.
Per ticket: `harness:ticket-runner`, entire, once. Downstream: the reconciler owns the
integration branch, the suite and the PR. The human owns the merge.
