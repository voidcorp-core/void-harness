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

### `VOID_PROJECT_ROOT` in every subagent's environment

Set `VOID_PROJECT_ROOT` to the installation root — the directory this adapter is
running in, which is where the controller created the worktrees from — in the
process environment of every subagent you spawn.

The hooks resolve where to write their telemetry from `VOID_PROJECT_ROOT`, else
`CLAUDE_PROJECT_DIR`, else the git toplevel they discover. A Codex subagent has
neither variable, so it discovers the toplevel of the worktree it is working in,
and the reconciler deletes that worktree at the end of the run: the run's hook
telemetry is gone before anyone reads the pull request, while the same run's
mission journal sits in the main checkout. One run, two halves, one deleted.

It has to be the environment you spawn with, not a line in the brief. An `export`
the agent runs in a shell call does not reach the process the runtime launches
hooks in, which is the one that writes. The Claude adapter sets nothing here
because it cannot and does not need to: the Workflow `agent()` primitive takes no
environment option, and the runtime already puts the session's project — the main
checkout — in `CLAUDE_PROJECT_DIR`, which every subagent inherits.

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
- state what reviewed it, in `review`;
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
- `plan.workerMayWriteSharedGitState` — write repository-shared git state;
- `plan.workerMayPruneMissions` — run `void-harness mission prune`, which
  deletes the mission journals of the repository and not of the worktree that
  ran it, its neighbours' runs included.

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

### `review` is required, and it is what the gate reads

On 2026-09-02 a worker was dispatched six specialists by the engine, could
convene none of them because its runtime exposed no fresh-context subagent
primitive, ran every review pass on itself, and said so in `decisions` -- a
field no later step reads. `reconcile`, `gate` and `publish` therefore produced
the same branch, the same body and the same green run as a panel-briefed unit,
on the project's highest-risk ticket.

So the record is a value, and the answer is refused without it:

```json
"review": {
  "kind": "panel",
  "passes": [{ "name": "architecture", "context": "fresh-context-subagent" }]
}
```

`kind` is `panel`, `self-review` or `none`. Report `fresh-context-subagent` only
for a pass a separate fresh context actually ran; a `panel` whose own list holds
a `self-review` pass is refused, because that contradiction is exactly what
prose let a worker state. A degradation carries `because`: `{ "kind":
"self-review", "passes": [...], "because": "<why no panel could be convened>" }`,
and `{ "kind": "none", "because": ... }` when no pass ran at all.

Report the degradation rather than working around it. A self-reviewed unit still
merges, with the downgrade named in the pull request body a person promotes on;
a unit nothing reviewed does not.

Return the collected results to the L0 skill. This adapter writes no run state
and comments on no ticket — there is one writer, and it is not the adapter.

### Tracker actions are applied by a subagent that holds the tracker tools

`reserve` and `lifecycle` return tracker WRITES as data — a transition, an
assignment, a lease comment, a state change with an idempotency key — never
argv. The argv executor has nothing to run for them, and on 2026-09-02 a
consumer's first run stopped at the lease for exactly that reason: the list was
filtered through a `command` field no tracker action carries, came back empty,
and nothing said so. Here a native subagent holding the tracker tools applies
each action exactly once, in order, and returns one receipt per action; a
result it could not observe is `unknown`, never `applied`. The cycle then
re-observes the reserved issues and calls `autopilot start` with the intent,
the receipts and that observation, so the lease is active only when every issue
converged and the run cursor exists before any worker is spawned. After
publication the same shape repeats: `lifecycle` plans, the subagent applies,
`lifecycle` reads the receipts, and the run calls the tracker synced only when
that second call says it converged.

### The lists you hand back describe the run, not what came back

`reconcile` audits a range against what the OTHER tickets of the cluster
declared, so shortening the run description switches the audit off without
malforming anything. Hand back every ticket the run reserved, blocked ones
included, and `orchestrate`'s footprints verbatim: a ticket dropped from that
list takes its claim with it, and the neighbour whose file was absorbed is no
longer there to be robbed.

The Claude adapter renders those two lists from the orchestration mechanically.
Here a subagent writes them, which is exactly the seam this warns about, so the
CLI refuses a payload whose lists disagree: a cluster ticket nobody declared, a
declaration for a ticket absent from the cluster, and a result, a failure or an
observed range naming a ticket the cluster does not hold are each a refusal.
Deriving a footprint list from the branch diff is not an answer either — it
would only ever agree with the diff it came from.
