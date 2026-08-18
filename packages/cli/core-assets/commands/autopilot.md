---
description: Drain a bounded cluster of independent ready tickets — each worked end-to-end by implement in its own worktree — into one integration PR the human merges.
argument-hint: "[--run <id>] [status|abort]"
---

Drive the `autopilot` skill for the program declared in `.void/active.md`.

Take no argument as the normal case: the active program names the tracker, the scope and the
base, so there is nothing to repoint. Do not ask which ticket, which cluster, which run id or
which tracker — if `ACTIVE.md` is missing or its `autopilot.enabled` is false, say so and stop
rather than inventing a target.

Follow the skill's cycle in order. The parts that are yours, not the CLI's:

1. **Preflight** the runtime adapter, the connectors, git permissions, base-branch protection
   and worktree creation — all of it, before the lease. A capability discovered missing halfway
   through leaves a claimed cluster nobody is working.
2. **Hydrate** the candidate observation from the tracker and pipe it to
   `void-harness autopilot plan --json`. The CLI contacts nothing; it computes.
3. **Show the human** the cluster, the lanes, the exclusions and their causes, and wait. This is
   the one confirmation the flow asks for.
4. **Apply** the returned actions, then re-observe every ticket. The lease is active only when
   all of them converged; partial convergence releases what was taken.
5. **Fan out** through the runtime's own primitive — Workflow on Claude, native subagents on
   Codex — with the `OrchestrationPlan` exactly as returned. Both runtimes must produce the same
   `WorkerResult`.
6. **Reconcile, seal, publish, drive the checks**, then keep the tracker current. Pipe the full
   remote observation into `void-harness autopilot status --json` and act on the verdict it
   returns rather than on the local cursor.

You never merge. Not with a flag, not when the checks are green, not when the diff is small —
there is no `--auto-merge` on any path, and `gh pr merge` is not yours to call. Report the PR,
the included tickets with their commit ranges, the excluded ones with their cause, the local
proofs and the remote runs spent.

`void-harness autopilot abort` gives the cluster back without deleting a branch, a commit or the
cursor. Prefer it to leaving a lease behind.
