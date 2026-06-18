---
name: backlog-batch
description: Opt-in attended mode that drains several independent Linear tickets in parallel, each in its own worktree subagent, reconciled into one integration PR. Sister of autonomous-backlog-loop.
---

# backlog-batch

The **attended, parallel** companion to `autonomous-backlog-loop`. You are present;
you want a few **independent** tickets done **now**, **in parallel**, **without breaking
anything**, and handed back as **one PR** to review. Each ticket is worked end-to-end by a
**worktree-isolated subagent**; the green branches are reconciled into a single
**integration PR** gated by the full suite.

**This is never a default.** It runs only when a human launches `/harness:backlog-batch`.
It requires the **Workflow** tool (deterministic multi-agent orchestration) to be available
and opt-in in the session — the launcher is the explicit trigger.

**Attribution**: see `.source`.

---

## Why this exists (and how it differs from the loop)

`autonomous-backlog-loop` is sequential, walk-away, one fresh **process** per ticket — the
faithful Ralph encoding. It does not serve "drain a handful of independent tickets in
parallel, attended". Doing that naively (N agents editing one working tree) corrupts
everything. Doing it well needs four things this skill provides:

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
   `void-harness backlog-batch plan` → `{ parallel, sequential, excluded }`. (Selection and
   the risk partition are the unit-tested CLI core; this step is not vibes.)
4. **Show the plan and CONFIRM with the human** — the parallel group, the sequential queue
   (with the reason: overlap / high-risk / low-confidence), and the excluded tickets. The
   human can drop a ticket or move one between groups. **No fan-out before confirmation.**
5. **Invoke the Workflow** with the confirmed plan as `args` (parallel list, sequential
   list, batchId, branchPrefix, reviewState, verifyCmd, autoMerge). Run
   `workflows/backlog-batch.workflow.js`.

### Layer 2 — Workflow (deterministic, background)

`workflows/backlog-batch.workflow.js`. Pure orchestration of the confirmed plan; it never
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

## Sister boundary with `autonomous-backlog-loop`

Distinct skills, distinct subjects (recouvrement < 30 %): shared Linear-selection and
worker-cycle vocabulary, different orchestration and risk model.

| | `autonomous-backlog-loop` | `backlog-batch` |
|---|---|---|
| Use | sequential, walk-away, unattended | parallel, attended, "now" |
| Worker | fresh `claude -p` **process** | **subagent** in a worktree |
| Orchestrator | deterministic **CLI** (zero LLM) | deterministic **Workflow** (subagents) |
| Output | one PR **per ticket** | one **integration** PR per batch |
| Reset | OS process | worktree + subagent context |
| Billing | strip API creds → subscription | **inherited** → subscription |

Pick the loop for overnight drain; pick the batch for a supervised burst of independent work.

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
| Workflow tool unavailable | This mode needs deterministic multi-agent orchestration. Use `autonomous-backlog-loop` (sequential) instead. |

---

## Final rule

```
Human confirms the risk-aware plan; the Workflow does the parallel work in worktrees,
green-or-blocked, reconciled to one integration PR gated by the full suite.
Otherwise → it is not a void backlog batch.
```
