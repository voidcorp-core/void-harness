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

- run the `void-implement` skill, whole and once, on this one ticket;
- re-fetch the complete ticket from the tracker first — never work from a
  summary;
- run every pass whose predicate fires, and only this ticket's gates;
- apply a migration against the dev/local database only;
- **never** push, open or update a pull request, merge, or move the ticket to In
  Review or Done;
- **never** write anything the repository shares across its worktrees;
- stop at a committed branch and return a `WorkerResult`.

### The prohibitions come off the plan, not off this page

That sentence above is only true if you render them from the plan the way the
Claude workflow does. Read them, and **fail closed** — only an explicit `true`
grants, so a plan that lost a field, or an older one that never carried it, is
refused rather than read as permission:

- `plan.workerMayPush` — push;
- `plan.workerMayOpenPullRequest` — open or update a pull request;
- `plan.workerMayTransitionTicket` — merge, or move the ticket to In Review or
  Done;
- `plan.workerMayWriteSharedGitState` — write repository-shared git state.

When the last one is not `true`, render `plan.sharedGitState` into the brief in
full: `shared` (the namespaces), `exception` (the one ref the worker owns),
`examples` (commands that break it), `instead` (what to do rather than
reinventing the gesture), `source` (where the list came from). If the plan
carries no such record, still refuse, in one sentence.

### What a worktree does not isolate

A worktree isolates the working tree, the index and `HEAD`, and nothing else.
The refs are one namespace for the whole repository — `refs/stash`, tags, notes,
remotes, every branch but the worker's own, and the repository config. On
2026-09-01 two subagents each ran `git stash push` to split a commit, and the
second `pop` took the first's entry: each ended up holding the other's files.

Subagents share filesystem access **and** that ref namespace. So the prohibition
is a class, not a banned command: a worker refused `git stash` alone reaches for
`git tag` or `git update-ref` and lands in the same place. To set changes aside,
`git diff > a file inside your own worktree` and `git apply` it back; to split a
commit, commit it on your own branch and amend or soft-reset afterwards.

A pre-existing stash entry belongs to whoever left it. Never list, pop or clean
the stack, and never count what is on it as this run's residue.

## The answer

A subagent that answers in prose has not answered. Validate every result against
the WorkerResult schema before it goes anywhere; an unparsable answer is a
failure for that ticket, not a reason to guess what it meant.

Return the collected results to the L0 skill. This adapter writes no run state
and comments on no ticket — there is one writer, and it is not the adapter.
