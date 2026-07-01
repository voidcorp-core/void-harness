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
> the deleted `autonomous-backlog-loop`. Risk-gated auto-merge of an attended cluster is wired
> (`--auto-merge`, see below); cluster auto-detection and the multi-cluster long-run L0 loop are
> still being added per `docs/specs/2026-06-21-backlog-autopilot.md` +
> `docs/specs/2026-07-01-backlog-autopilot-auto-merge-mvp.md`. The per-ticket quality cycle is now the
> dedicated `harness:ticket-runner` skill (single source of truth), which each worker runs.
> The attended batch below is the stable core they build on.

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
   (with the reason: overlap / high-risk / low-confidence), the excluded tickets, **and the
   `verifyCmd`** (which must mirror CI — see below). The human can drop a ticket, move one
   between groups, or correct `verifyCmd`. **No fan-out before confirmation.**
5. **Invoke the Workflow** with the confirmed plan as `args` (parallel list, sequential
   list, batchId, branchPrefix, reviewState, verifyCmd, autoMerge). Run
   `workflows/backlog-autopilot.workflow.js`.

### Layer 2 — Workflow (deterministic, background)

`workflows/backlog-autopilot.workflow.js`. Pure orchestration of the confirmed plan; it never
prompts the human:

- `parallel()` the parallel group, then the sequential queue in topological order — each
  ticket an `isolation:"worktree"` subagent running the **`harness:ticket-runner` cycle**
  for that ticket. ticket-runner is the single canonical per-ticket expert cycle (ingest +
  completeness gate, architecture, TDD, E2E, UX/UI, security, review, verify), with its
  passes triaged by observable predicate so trivial tickets stay fast. The worker stops
  **green-or-blocked** and does **not** open a PR: ticket-runner's final ship step is owned
  by the reconciliation subagent here, not the worker.
- **Red-ticket handling is adaptive**: a blocked ticket is excluded with its dependents; if
  the red was a depended-upon root, the whole cluster is blocked (no PR), branches preserved.
- A **reconciliation subagent** creates `cluster/<id>`, merges the green branches
  (conflicts resolved **keeping both tickets' intent**), runs the **full suite**, then a
  **level-2 code-review** with a bounded review→fix loop (max 3 passes). Converged → one PR
  per cluster referencing every ticket + decisions, tickets moved to the review state. Not
  converged → **blocked** with the outstanding findings, no PR, branches preserved.

### `verifyCmd` must mirror CI, not a subset

"The full suite is the judge" only holds when `verifyCmd` **equals the project's CI gate**.
For an **app workspace** (Next.js especially) `test` + `type-check` is *not* the gate: it is
blind to build- and run-time integration failures that a clean git auto-merge cannot see —

- **client/server boundary** breaks (a `'use client'` import pulling a `server-only` module
  into the client graph) surface only under `build` (Next's client/server graph analysis);
- **route-tree conflicts** (clashing dynamic slug names at one path position) can pass the
  production build yet crash `next dev` — the Playwright `webServer` — on boot;
- **migration / seed gaps** FK-violate the first authed write only once the e2e suite runs
  against a migrated *and seeded* database.

So when an app is in scope, default `verifyCmd` to the full CI gate — include `build` and the
e2e/integration suite when one exists (e.g. `pnpm build && pnpm test && pnpm test:e2e`) — or
prompt the human to set it to the project's gate. The **same** `verifyCmd` runs in the
per-ticket worker and in reconciliation, so a green batch means a green CI by construction; a
subset command produces the green-batch / red-CI divergence this skill exists to prevent.

---

## Long-run autonomy (multi-cluster)

Beyond a single burst, the launcher drains a pool over hours, **one cluster at a time**:

- **Base**: `develop` if it exists, else `main`. A cluster that depends on an earlier,
  unmerged cluster branches from **that cluster's branch** (a stacked PR); independent
  clusters branch from the base.
- **Risk-gated auto-merge** (`--auto-merge`, opt-in). After the reconciliation subagent opens
  the **green** integration PR, and only if `--auto-merge` was passed, the launcher decides
  whether to arm the merge — it never decides by hand:

  1. Gather observations via `gh` for the PR: `gh pr diff <pr> --name-only` (files),
     `gh pr view <pr> --json mergeable,mergeStateStatus,statusCheckRollup` (→ `mergeable`,
     `checks`, `baseUpToDate`), and the base branch protection (`gh api .../branches/<base>/protection`
     → `protected` / `unprotected` / `unknown`).
  2. Pipe `{clusterId, files, protection, observation}` as JSON to
     `void-harness backlog-autopilot merge-decision --auto-merge [--auto-merge-method M]`. The CLI
     composes the risk gate + protection gate + merge-state machine and returns `{arm, action,
     reason}` — **it never merges**.
  3. Act: `arm:true` → `gh pr merge <pr> --auto --<method>` (arms; GitHub merges once checks
     finalize). `arm:false` → **leave the PR for a human** and report the `reason`.

  `--auto-merge-method=merge|squash|rebase` (env `AUTO_MERGE_METHOD`, default `merge`): the
  integration PR bundles N tickets, each with its own `test:`/`fix:` commits and "why" bodies, so
  a merge commit preserves that per-ticket history — squashing collapses the cluster into one
  commit, against `commit-discipline`'s "the git log is documentation". Risky clusters (UI /
  security / migration / large diff) and stack roots return `arm:false` — a human merges them.
  Indeterminate/unknown branch protection is **fatal** under `--auto-merge` (the decision blocks).
  A merge conflict **blocks** (never a silent resolution). Multi-cluster stacked merges (strictly
  sequential: parent fully merged → rebase the single next child → block on conflict) are the
  deferred L0 loop; the MVP arms one attended cluster at a time (`isStackRoot=false`).
- **Durable state**: `.void/autopilot/<runId>/` (atomic writes; the cluster statuses are
  the resume cursor). On resume the launcher **reconciles against the remote** (open PRs),
  not a replayed cursor. A **budget circuit breaker** (tokens / time) stops the run cleanly.
- **Operator subcommands**: `status`, `resume`, `explain-blocked`, `abort` over a run id.
- **Thin orchestrator**: the launcher never reads implementation files; it re-reads the
  state and compacts between clusters, so it does not rot over a long run. A `/context-save`
  closes the run for the human.

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
  port/DB collision), and `verifyCmd` must mirror CI (build + e2e, not just test +
  type-check). A green auto-merge that breaks the build is caught here.
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
