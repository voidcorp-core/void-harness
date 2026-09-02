---
name: void-autopilot
description: Use to drain a bounded cluster of independent ready tickets, each run end-to-end by implement in its own worktree, reconciled into one integration PR the programme's declared merge gate disposes of.
---

# autopilot

Take up to four independent ready tickets, work each one properly, hand back a single
integration PR. Who disposes of that PR is the programme's declaration, not this skill's:
`mergeGate: human` keeps it yours, `mergeGate: union-reviewed` lets the grant merge it into
a non-deploying branch once every refusal below is cleared. Promotion to the branch that
deploys stays human in both cases.

**Attribution**: see `.source`.

---

## What this skill does NOT do

It owns no ticket cycle. Every worker runs the canonical `void-implement` skill, whole, once
per ticket. If you find yourself writing "then the worker runs the tests, then reviews…"
inside autopilot, stop: that behaviour has one owner, and duplicating it means the two copies
drift and tickets get a different standard depending on how they were started.

It also never merges on a flag. Not on the command line, not because the checks are green,
not because the diff is small. Consent to a machine merge is a durable declaration in the
programme — `mergeGate: union-reviewed` together with a `deployBranch` — and there is no
`--auto-merge` on any path.

Under that declaration the grant refuses unless **all** of the following hold, and each
refusal names itself:

| refusal | when |
|---|---|
| `production-downstream` | the target resolves to the branch that deploys, or one of the two cannot be read as a branch name at all |
| `human-gate` | the cluster carries a unit listed in `humanGates`, compared on a normalised identity (case, surrounding space and one leading `#` folded), or an identity on either side could not be read at all |
| `base-unprotected` | server-side protection of the base was not positively observed, and unknown counts as unprotected |
| `sensitive-path` | the diff touches a migration, a workflow or action under `.github/`, a lockfile or `CODEOWNERS` (the `mergeBlocks` list, deliberately not `ownership.sequential`), or the diff could not be listed |
| `union-unread` | no reading ran, or the one that ran could not finish |
| `union-contradicted` | the reading found at least one blocking contradiction, or reports a refutation it names nothing for (an advisory finding is carried over and does not stop the merge) |
| `review-stale` | the reading is about a tree the branch head has moved away from |

The first four sit ahead of the reading on purpose: no re-reading can lift them, so reporting
a stale verdict there would send someone off to run a pass that cannot unlock anything.

### What makes a finding blocking

Leaving `blocking` undefined is what makes a reading refuse forever: in a mechanism whose
subject is safety there is always one more true finding, so a pass that blocks on every true
finding never converges. A finding blocks only when all three hold.

1. **Reachable without forgery.** The nominal path leads there — the workflow as it runs, an
   agent obeying its brief, an operator in good faith, an ordinary declared footprint. A finding
   that needs a payload hand-built to lie coherently across several fields does not block. A
   plausible mistake still does: a mistake is not a lie.
2. **A real consequence.** Code nobody claimed enters the base, or a guarantee this harness
   states is false on a path someone takes.
3. **Owned by this diff.** A pre-existing defect, however grave, is a ticket. Refusing the diff
   that revealed it neither repairs it nor contains it.

Everything else is advisory: real, anchored, filed, and it does not stop the merge. The number
of blocking findings measures nothing about the reading — a pass that names none and files four
is a good pass, and one that promotes an advisory to justify itself is not.


Each cell above is the sentence the CLI exports next to the check that raises it, and a test
compares the two. This table said `sensitive-path` fired on `ownership.sequential` while the
code deliberately did the opposite: every refusal was named, so a test that looked for names
stayed green while the description was wrong.

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
`unsupported-runtime` before any progress-provider mutation.

**The workers.** One ticket, one worktree, one branch, one full `void-implement` run.

---

## Where the target comes from

The run takes no argument in the normal case. `.void/program.md` names the progress provider, its
opaque scope and the base, so there is nothing to repoint and nothing to ask: not which work unit,
not which cluster, not which run id, not which provider.

That file is also the consent, and consent is never inferred. An absent `.void/program.md`, a
`status` other than `executing`, an `autopilot` block that is missing or unreadable, or
`autopilot.enabled: false` all mean the same thing — say so and stop. Inventing a target here
claims tickets nobody agreed to hand over.

---

## Hydration: filling what the CLI validates

The CLI contacts nothing, so you are the only layer that reads the tracker and git. It does not
leave you guessing what it wants: **run `autopilot scaffold <plan|start|status|marker>` and fill
the payload it prints.** Each field comes back with a note saying where to obtain it, and a
refusal names the field, the type and the note. If you find yourself opening a `.ts` file to
learn a shape, stop and run the scaffold instead -- that is the whole reason it exists.

**For `plan`.** Read `.void/program.md` once: `progress.order` is the pool, `progress.states`
tells ready from done. Fetch every unit in that order that is not done. `ready` is its state in
`states.ready`; `blockedByOpen` is true when any native blocker is not done -- read the relation,
never the prose. `footprints.areas` are the paths the ticket names as its anchors, **at least
one**: a ticket whose `areas` is empty is excluded as `missing-footprint`, exactly like one the
estimator never produced. Autopilot routes on footprints, so a ticket naming no ground gives it
nothing to route on, and reconciliation cannot protect ground nobody named -- admitting it only
moved the refusal to the last step of the run, after both workers had finished. Run that ticket
through `void-implement` directly, or name its areas. `highRisk` is a guard, a migration, a
lockfile or a published contract; `confidence` is your own statement about how well you know the
footprint, and a low one is what shrinks the cluster on purpose.

**For `start`.** Render the marker with `scaffold marker`, fill it, and post it as a comment on
**every** ticket in the cluster before claiming any of them. Then claim each one. Then re-read
**every** ticket -- state, assignee and comments -- into `reobservation`. Report each write in
`applied`, and use `unknown` when a write's result did not come back: a write you are unsure of
makes the whole picture untrustworthy even when the re-observation looks converged, and saying so
is what keeps the lease honest. `state` is the local cursor, with `base.sha` the full commit the
run was planned against.

**For `status`.** Every field is a `BoundaryReading`: `{ kind: "value", value: ... }` when you
read it, `{ kind: "nil" }` when you could not. Those are different answers and the recovery
verdict depends on the difference -- an absent pull request is an absence, not a merge.

## The cycle

**You do not run the cycle. A script does.** `workflows/autopilot.workflow.js` holds the control
flow, and every decision inside it goes through `void-harness autopilot <step>` — a command that
observes nothing, writes nothing, and returns a plan or a verdict.

That inversion is the point of this skill. The cycle used to be a numbered list here, and the
model was the mechanism: it read the list, decided when a unit was done, and remembered to take
the lease. Twenty-seven functions that compute those decisions had no caller at all, which is what
a procedure made of prose costs. Prose cannot drift from code when prose is no longer the
mechanism.

| step | it answers | and refuses when |
|---|---|---|
| `base` | which branch this run integrates into, and whether it is really protected | the protection could not be read — an unauthenticated `gh` and an open branch look identical |
| `chain` | take another unit, or stop | the budget cannot cover one, the base is red, or nobody verified it |
| `reserve` | may this run take the cluster | someone else holds it, or the observation is unusable |
| `orchestrate` | lanes, assignments, and the git commands that make the worktrees | a base sha that is not a commit, or a footprint declared for a ticket absent from `tickets` |
| `reconcile` | which ranges merge, as commands | a head the worker claims that git does not have, a range holding a file another ticket declared, or a payload whose cluster, declarations, results and observed ranges do not describe the same run |
| `verify` | the suite that decides the merge, bounded | — |
| `gate` | did the proofs run on THIS tree, did the panel speak first, did the unit stay in its ceilings | any of them unproven; absence of a record is absence of the act |
| `publish` | one branch, one refspec, one pull request, and the body that carries the account | the proofs are not sealed |
| `grant` | may this merge itself, and the one `gh pr merge` it permits | see the refusal table below |
| `landed` | whether that merge actually landed, from the commit GitHub reports | — |
| `lifecycle` | what the tracker owes, and whether it got it | — |
| `progress` | where the run is, and whether its silence means anything | — |
| `observe` | what each boundary actually answered | — |

Every step takes its observation on stdin and answers with `--json`. Run
`void-harness autopilot scaffold` with no step to list the ones it covers, and
`void-harness autopilot scaffold <step>` for the exact shape and where each field comes from. For
those steps the scaffold IS the contract, and cannot drift from it: a test pipes every scaffold
back through its own validator. Five steps carry one today -- `plan`, `chain`, `start`, `status`
and `reconcile`. The others are documented by their own refusal, which names the field it wanted
and where to obtain it; a step whose refusal can stop a run is worth a scaffold, and the ones
without are a gap rather than a decision.

### What the order guarantees

The sequence above is not a convenience, and three of its properties are load-bearing enough that
tests hold this file to them.

- **Every worktree and branch exists before any spawn**, including for sequential tickets. A worker
  never chooses its own checkout and never works in the main one — `orchestrate` returns the setup
  commands, and they run before a single agent starts.
- **A write that returned is not a fact.** The lease is active only once the run has
  **re-observe every ticket** and seen all of them converge; partial convergence releases what was
  taken, because half a cluster produces an integration pull request that can never be complete.
  The same rule governs ranges: `reconcile` believes git, never the worker's own commit list.
- **A migration is never parallel**, whatever its estimate says, and neither is a low-confidence
  footprint, a lockfile or a shared-ownership path. `orchestrate` sequences what it cannot prove
  disjoint, and names why each ticket lost its parallel slot.

### What a worktree does not isolate

A worktree isolates the working tree, the index and `HEAD`. It does **not** isolate the
repository's refs: `refs/stash`, `refs/tags/*`, `refs/notes/*`, `refs/remotes/*`, `refs/heads/*`
and the repository config are one namespace for every worktree at once. On 2026-09-01 two workers
each ran `git stash push` to split a commit, and the second `pop` took the first worker's entry:
each ended up holding the other's files.

So the plan denies the **class** -- writing anything the repository shares -- and not one command.
A worker refused `git stash` alone reaches for `git tag`, or `git update-ref`, and lands in the
same shared space. The one exception is the branch its own assignment names, which is what it was
created to write. `orchestrate` carries the list, the exception, the commands that break it, the
replacement gesture and the git documentation it was derived from, so the brief renders the
prohibition from the plan instead of restating it.

**The replacement gesture**, because a worker denied one reinvents it: to set changes aside,
`git diff > a file inside your own worktree` and `git apply` it back; to split a commit, commit it
on your own branch and amend or soft-reset afterwards. Both stay inside the worktree.

Any pre-existing stash entry belongs to whoever left it. A run never lists, pops or cleans the
stack, and never counts what is on it as residue of its own. An overwritten entry is not lost
either: its commit becomes unreachable rather than collected, so an incident report gives the sha
and the command that recovers it.

### A range carries only what its ticket claimed

`reconcile` proves ancestry -- the range is linear, descends from the base, matches the declared
commits. That says nothing about **whose** files are in it, and two disjoint footprints merge
without a conflict either way, so contamination reaches the pull request unnoticed. The audit
answers the second question, against `git diff --name-only` and never against the worker's own
list: a claim cannot clear a range of carrying somebody else's work, and a range git was never
read for is excluded as `footprint-unobserved`.

What it refuses is narrow on purpose. A file **another ticket of the cluster declared** is a
breach: nothing legitimate produces it. A file nobody predicted is a widening, and it passes --
a ticket that enumerates from the manifests finds the packages its author missed, and a guard that
refuses that discovery is a guard that hides defects. A file **two tickets both reach** passes too,
and not only when they spelled it the same way: `packages/**/*.test.ts` and `packages/core/b` both
reach `packages/core/b/x.test.ts`, neither declaration is more specific than the other, so both
were entitled. A **carve-out** does not: `packages/core` claims `packages/core/b/x.ts` by prefix,
but a neighbour declaring `packages/core/b` drew a boundary rather than repeated one, so the wider
ticket writing there is a breach. Owning the file no longer ends the question -- it used to, and
the carved-out file then came back within-scope with an empty widening, invisible rather than
merely permitted. Sequencing does not compensate for theft: two sequential workers still hold two
worktrees on the same base, and it addresses lockfiles and migrations. What it does buy is the tie:
a pair the audit will read as jointly entitled is a pair **ordering has sequenced**, which is why
ordering separates two areas only when no file can lie in both, never merely when neither names the
other. A `reconcileOnly` path is not judged, since the reconciler strips and rebuilds it anyway.

**The audit cannot be off.** A cluster of more than one ticket that reaches `reconcile` without a
declaration covering every one of them is refused outright, and so is a range whose observed file
list is missing, empty, or not the list of paths git produces. An audit that could be skipped by
omitting a field produced an empty `excluded` byte for byte identical to a clean one, so nobody
could tell audited-and-clean from never-audited. The declaration is not re-derived either:
`orchestrate` returns the footprints it ordered on, and the script hands them to `reconcile` -- a
list reconstructed from the branch diff would only ever agree with the diff it came from. A cluster
of one is not audited, because there is no other ticket to rob.

**And it cannot be off by shrinking a list either.** `cluster`, `footprints`, `results`,
`failures` and the ranges git was read for must all describe the same run. Shortening `cluster` and
`footprints` TOGETHER leaves two lists that agree with each other and an audit armed for one ticket
where the run reserved two, so the neighbour whose file was absorbed is not there to be robbed. The
check therefore runs in every direction: a cluster ticket nobody declared, a declaration for a
ticket the cluster says it never reserved, and a result, a failure or an observed range naming a
ticket absent from `cluster` are each a refusal. Passing the tickets that CAME BACK rather than the
ones the run reserved is the cheapest way to disarm the guard, and the proof of that
under-declaration always sits in the same payload as the under-declaration. An `areas: []` entry
counts as no declaration at all: nothing can be stolen from a ticket that claims nothing, so every
neighbour walks into its ground reported as a widening. That refusal is a **backstop** for a
hand-built cluster, not the place the case is meant to be caught -- `plan` excludes such a ticket
before any worker starts, because a refusal at reconciliation arrives after the whole run is paid
for and leaves no legal move: inventing the area is the tautology the audit exists to forbid, and
shrinking `cluster` is refused as soon as the ticket returned a result. If you reach it anyway,
declare the areas and plan again -- and read the whole diff of every range yourself before any of
it merges, because an entitlement nobody declared cannot be recovered from the range under
suspicion. The refusal used to offer instead: reconcile each range as its own cluster of one,
"exactly the coverage a ticket claiming nothing ever had". It is not. The maximum severity an
undeclared ticket gets exists only because a neighbour sits in the same cluster to be robbed; a
cluster of one audits nothing, so that split turns the audit off for every ticket of the cluster,
the ones that did declare included.

Areas are read in one spelling. `packages/core/templates/`, `./packages/core/templates` and
`packages/core/templates` are the same area, and an area that claims nothing after that reading --
empty, absolute, or carrying an empty or dot segment such as `packages//core` or `../x` -- is
refused rather than silently matching no file.

### Reading a run while it happens

The pull request opens as a **draft at the first merged unit**, and its body is rewritten after
every decision. That body is the whole surface: a phone shows six lines, and the first of them says
`ALIVE`, `STALLED`, `STARTING` or `ENDED`, with the last unit named.

`STALLED` is the one that means something. A quiet run and a dead one look identical from outside,
so the run compares its own silence against the ceiling a single unit may take: quieter than that
is working, longer than that has stopped without saying so. An `ENDED` run is never stalled
however old its last beat, because the two send a reader to opposite places — one to wait, one to
go looking.

A draft does not wait for sealed proofs. It is a window, and refusing to open a window because the
work is unfinished keeps the run invisible for exactly as long as it is unfinished. Nothing merges
from it: the grant still needs everything it needed, and the draft is marked ready only when the
publication that asks for a merge carries its proofs.

**What stays yours.** Launching the run, confirming the cluster before the lease, and the merge
into the branch that deploys. Everything a model still does inside the run is judgment: working a
ticket, reading the union. The script never asks it to remember a step.

## The chain: `mode autopilot 6h`

A duration, not a ticket count -- "drain the backlog while I am out" is a length of time, and
five units says nothing about whether that is twenty minutes or a day.

The budget comes from `autopilot.chainBudget`. **Written, it is a ceiling** and an invocation may
only shorten it: the declaration is the consent to run unattended, and a consent any command line
could widen would not be one. **Absent, two hours is a fallback** and `--for 6h` runs six hours,
because nobody consented to a default by leaving a field out.

Neither the loop nor the decision is yours: the script asks `autopilot chain` between every unit
and acts on what comes back. What matters to a reader is what the answer means.

On `stop`, the run ends there. It is not a pause: leases, branches, commits and the cursor stay
exactly where they are, and the report names the unit it stopped on and the reason. Four reasons
end a run badly -- a red base, a base nobody verified, a verification taken on some other tree,
and a budget or clock that cannot be read -- and three end it well: the budget is spent, nothing
is ready, or a unit is published and waiting for a person. `nextUnit` is absent on every stop, so
a caller cannot take one anyway.

A unit is taken once. The observation lists every unit the run took with what became of it --
`merged`, `published-awaiting-human`, or `unit-blocked` with its cause (no range survived, the
proofs refused, the reconciler excluded the ticket) -- and none of those is remaining: on
2026-09-02 the chain knew only `merged`, counted a unit handed to a person as still ready, and
proposed it again onto its own open pull request. A unit that came back unmerged still measures
how long a unit takes here, so the cold estimate only ever serves a run that took nothing yet.

A unit already under way is never cut in half. The budget decides whether to START another one;
cutting mid-unit leaves a worktree and half a ticket, which costs more than the overrun it saves.

The pull request body carries the journal verbatim. It is what makes per-unit provenance a claim
a reader can check rather than a summary somebody wrote afterwards.

---

## Resuming, and closing

A session that comes back reads the remote before it reads its own cursor. Pipe the full pull
request observation — number, state, head ref and sha, base ref and sha, merge sha, checks —
into `autopilot status`, and act on the verdict it returns:

| Verdict | What it means | What you do |
|---|---|---|
| `publish` | nothing was observed on the remote | publish; it is idempotent against an existing request |
| `republish` | the remote head lags the local one | push the same branch again |
| `rebase` | the base moved under the run | rebase, reconcile again, re-run the whole suite; the proofs are stale |
| `await-checks` / `fix-checks` | required checks pending, or red on this diff | wait, or fix locally and push again |
| `ready` | every required check is green | ask the grant, and do what it returns: merge when it grants, hand it over with the refusal when it does not; move the included tickets to In Review either way |
| `merged` | GitHub reported a merge commit | move the included tickets to Done, close the lease |
| `blocked` | closed unmerged, a foreign branch, a merge with no commit, a red check this diff does not own | stop and report; none of these is a completion |
| `observe-again` | the reading was partial | read it again; a partial answer is not an answer |

The verdicts that end a run demand evidence and refuse an inference. An absent pull request is
an absence. A closed one is a refusal. Only a merge commit is a merge. Tracker writes carry an
idempotency key derived from the run, so a write whose result came back unknown is retried as
the same write and never as a second one — and a partial write keeps the run in
`tracker-reconciliation` rather than letting it call itself synced.

`abort` releases the claim, never the work: leases go back, branches, commits and the cursor
stay exactly where they are, and no ticket moves forward.

---

## What a worker is given, and what it may do

Given: exactly one ticket id, one worktree path, one branch, and the paths of the global plan
and spec. It re-fetches the complete ticket itself — never work from a summary.

May: run every `void-implement` pass whose predicate fires, run its own targeted gates, apply a
migration **in dev/local only**, and commit a bisectable range.

May not: push, open or update a pull request, merge anything, move the ticket to In Review or
Done, touch a file the plan marks `reconcileOnly`, or write anything the repository shares across
its worktrees — `refs/stash`, tags, notes, remotes, any branch but its own, the repository config.
These are denied in the orchestration plan itself, not only in the prompt, so an adapter that
honours the plan cannot grant them; both adapters render them from the plan, and a test holds each
`workerMay…` field to appearing in both.

---

## Red flags

| Rationalization | Reality |
|---|---|
| "The worker can just push its branch, it is faster" | Workers are commit-only. A pushed worker branch triggers CI on work that has not been reconciled. |
| "Both tickets touch different folders, run them in parallel" | Different folders, same lockfile is still a collision. The partition decides, not the intuition. |
| "The tracker write probably worked, carry on" | A write with an unknown result is unknown. Re-observe; never conclude from a request that timed out. |
| "Only one ticket failed, ship the other three" | That is exactly right — and it is what partial success does. But the failed one keeps its branch and its blocker. |
| "The cluster is only three tickets, skip the review budget" | The budget is what shrank it to three. |
| "Autopilot should run the tests too" | `void-implement` runs them. Autopilot runs the full suite once, at reconciliation, on the integrated branch. |
| "The suite was green before the rebase, publish" | The proof was about a tree that no longer exists. Re-run it. |
| "That check is flaky, turn it off and the PR goes green" | The check is the gate. A failure it does not own is escalated, not silenced. |
| "The PR is gone from the list, it must have been merged" | An absent pull request proves nothing. Done comes from an observed merge SHA. |

---

## Composition

Upstream: `void-ticket` authors the work units and the program descriptor.
Per ticket: `void-implement`, entire, once. Downstream: the reconciler owns the
integration branch, the suite and the PR. The merge belongs to whoever the grant
names: the human under `mergeGate: human`, and under `union-reviewed` the human
still for anything the grant refuses, promotion to the deploying branch included.
