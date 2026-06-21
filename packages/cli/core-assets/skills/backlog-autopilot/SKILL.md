---
name: backlog-autopilot
description: Opt-in skill draining independent Linear tickets in parallel, each in its own worktree subagent, reconciled into one integration PR gated by the full suite. Cluster mode + long-run autonomy incoming.
---

# backlog-autopilot

The in-session skill that drains a Linear pool into clean PRs. Today it does the
**attended, parallel** burst: you are present; you want a few **independent** tickets done
**now**, **in parallel**, **without breaking anything**, and handed back as **one PR** to
review. Each ticket is worked end-to-end by a **worktree-isolated subagent**; the green
branches are reconciled into a single **integration PR** gated by the full suite.

> **Consolidation in progress.** `backlog-autopilot` replaces the former `backlog-batch` and
> the deleted `autonomous-backlog-loop`. The cluster auto-detection, adaptive per-ticket
> quality cycle, multi-cluster long-run autonomy and risk-gated auto-merge are being added
> per `docs/specs/2026-06-21-backlog-autopilot.md`. The attended batch below is the stable
> core they build on.

**This is never a default.** It runs only when a human launches `/harness:backlog-autopilot`.
It requires the **Workflow** tool (deterministic multi-agent orchestration) to be available
and opt-in in the session — the launcher is the explicit trigger.

**Attribution**: see `.source`.

---

## Why this exists

Draining a handful of independent tickets in parallel, attended, is its own problem. Doing
it naively (N agents editing one working tree) corrupts everything. Doing it well needs four
things this skill provides:

1. **Worktree isolation per ticket** — every subagent has its own git worktree and branch;
   parallel file edits never collide at the working-tree level.
2. **Risk-aware routing, not blind parallelism** — file footprints are *estimated*, and only
   genuinely non-overlapping, low-risk tickets run concurrently; overlap / lockfile /
   migrations are **sequenced**.
3. **A deterministic orchestrator** — a Workflow script (JS), not a long LLM session, so the
   loop control never rots. The in-session launcher only *gathers and confirms*; the
   Workflow *executes*.
4. **Reconciliation that catches what git misses** — a reconciliation subagent merges the
   green branches and the **full suite** is the judge (a clean auto-merge can still be a
   broken build).

---

## The two layers

### Layer 1 — Launcher (in-session, interactive)

You (the main session) run this. It ends at the human confirmation gate; it never fans out.

1. **Select** the candidate batch via the Linear MCP: tickets in the target state, **not
   blocked** by any still-open ticket. Gather for each: id, title, priority, board order,
   `dependsOn`.
2. **Estimate the footprint** of each candidate — dispatch a **lightweight estimator
   subagent** per ticket (a cheap model is fine):

   > Read ticket `<id>` (`<title>` + description). Predict the files/areas it will most
   > likely touch (e.g. `src/auth`, `db/migrations`). Flag `highRisk: true` if it plausibly
   > touches a lockfile, migrations, or another guaranteed-collision zone. Return
   > `{ id, areas: string[], highRisk: boolean, confidence: 0..1 }`. Low confidence is
   > honest — it routes the ticket to the safe (sequential) path.

3. **Compute the plan** deterministically: pipe the tickets + estimates as JSON to
   `void-harness backlog-autopilot plan` → `{ parallel, sequential, excluded }`. (Selection and
   the risk partition are the unit-tested CLI core; this step is not vibes.)
4. **Show the plan and CONFIRM with the human** — the parallel group, the sequential queue
   (with the reason: overlap / high-risk / low-confidence), and the excluded tickets. The
   human can drop a ticket or move one between groups. **No fan-out before confirmation.**
5. **Invoke the Workflow** with the confirmed plan as `args` (parallel list, sequential
   list, batchId, branchPrefix, reviewState, verifyCmd, autoMerge). Run
   `workflows/backlog-autopilot.workflow.js`.

### Layer 2 — Workflow (deterministic, background)

`workflows/backlog-autopilot.workflow.js`. Pure orchestration of the confirmed plan; it never
prompts the human:

- `parallel()` the parallel group, then the sequential queue one-by-one — each ticket an
  `isolation:"worktree"` subagent running the full craftsman cycle (pick → plan → tdd →
  **verify** → commit), green-or-blocked. Workers do **not** open PRs.
- **Blocked tickets (verify red) are excluded** from integration, branch preserved, reported.
- A **reconciliation subagent** creates `integration/<batchId>`, merges the green branches
  (resolving conflicts **keeping both tickets' intent**), and runs the **full suite**. Green
  → one integration PR referencing every ticket + decisions, tickets moved to the review
  state. Red → batch **blocked** with evidence, no PR, branches preserved.

---

## Single skill, in session

`backlog-autopilot` is one skill: the deleted `autonomous-backlog-loop` ran an out-of-session
`claude -p` process per ticket and lost the in-session MCP / connector / subscription
inheritance, so its capability was folded in here. Workers are **subagents in worktrees** that
inherit the session auth → the subscription. A future **headless backend** (walk-away / cron)
is reserved and deferred, not the deleted loop.

---

## Safety

- **Attended, HITL at the edges.** The human confirms the parallel/sequential plan before
  fan-out and **owns the integration PR merge**. No auto-merge unless explicitly opted in.
- **Subscription-billed.** Subagents inherit the parent session's auth → the subscription;
  nothing to strip. The security hooks stay live inside every worktree.
- **The full suite is the judge.** It runs on the integration branch (sequential → no
  port/DB collision). A green auto-merge that breaks the build is caught here.
- **Conservative routing.** Unknown footprint, low confidence, lockfile, migrations → always
  sequential. A wrong "parallel" call costs a conflict; a wrong "sequential" call costs only
  time.
- **Concurrency cap.** Default a small parallel width (3). Projects whose tests bind
  ports/DB should keep it low; the integration run is the authoritative gate regardless.

---

## Anti-rules

- MUST NOT run unprompted or as a default.
- MUST NOT fan out before the human confirms the plan.
- MUST NOT parallelize tickets with a dependency edge or an estimated footprint overlap.
- MUST NOT let a worker open a PR — the reconciliation subagent opens the single integration PR.
- MUST NOT open the integration PR on a red full suite — block with evidence instead.
- MUST NOT merge to a protected branch without an explicit auto-merge + green CI.

---

## When you are stuck

| Problem | Solution |
|---|---|
| Everything routed sequential | Estimates overlap or are low-confidence. Inspect the plan's reasons; refine ticket scoping so footprints are disjoint. |
| Integration suite red after merge | A semantic conflict git did not see (migrations, barrel, lockfile). The batch is correctly blocked; resolve on the preserved branches. |
| A worker blocked | Read its Linear evidence. It is excluded from the batch PR; fix the upstream cause, not the prompt. |
| Workflow tool unavailable | This skill needs deterministic multi-agent orchestration. Enable the Workflow tool, or stop. |

---

## Final rule

```
Human confirms the risk-aware plan; the Workflow does the parallel work in worktrees,
green-or-blocked, reconciled to one integration PR gated by the full suite.
Otherwise → it is not a void backlog batch.
```
