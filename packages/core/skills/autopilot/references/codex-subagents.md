# Codex adapter — executing an OrchestrationPlan with native subagents

Codex has no Workflow primitive. It has subagents, and they are enough, because
every decision was already made by the CLI: this adapter executes, it does not
plan.

Read `plan.assignments` and do exactly what it says. Do not re-derive lanes from
footprints, do not reorder, do not merge two tickets into one subagent. A lane
that this adapter computes differently from the Claude one is two different
integration branches from the same cluster.

## Before any subagent

The worktrees already exist — the controller created them from `plan.base.sha`
before this adapter was invoked. If one is missing, stop and report
`unsupported-runtime`; do not create it here and do not fall back to the main
checkout.

Subagents share filesystem access. The isolation is the pre-created worktree and
the explicit working directory you pass, never an assumed sandbox.

## Execution

1. Every assignment with `lane: "parallel"` runs concurrently, at most
   `plan.concurrency` at a time.
2. Every assignment with `lane: "sequential"` runs afterwards, one at a time, in
   ascending `order`. They are sequential because they collide — with each
   other, with a lockfile, or with shared dev state. Overlapping them defeats
   the point.
3. Each subagent gets exactly one assignment: `worktreePath` as its working
   directory, `branch` as its already-checked-out branch, and the ticket id.

## The worker instruction

Every subagent receives the same instruction as its Claude counterpart:

- run the `implement` skill, whole and once, on this one ticket;
- re-fetch the complete ticket from the tracker first — never work from a
  summary;
- run every pass whose predicate fires, and only this ticket's gates;
- apply a migration against the dev/local database only;
- **never** push, open or update a pull request, merge, or move the ticket to In
  Review or Done;
- stop at a committed branch and return a `WorkerResult`.

## The answer

A subagent that answers in prose has not answered. Validate every result against
the WorkerResult schema before it goes anywhere; an unparsable answer is a
failure for that ticket, not a reason to guess what it meant.

Return the collected results to the L0 skill. This adapter writes no run state
and comments on no ticket — there is one writer, and it is not the adapter.
