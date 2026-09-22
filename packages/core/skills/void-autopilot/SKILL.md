---
name: void-autopilot
description: Use to run the continuous delivery loop, where a curator ranks the backlog, up to four workers each run void-implement to a PR, and a bounded review gates the GitHub merge queue until drained or stopped.
---

# autopilot

A continuous loop that takes tickets from the tracker to the integration branch without a human
at each merge. A curator ranks what is worth doing, up to four workers each carry one ticket to
a pull request, a reviewer reads each one once, and GitHub merges what is green through its merge
queue. Promotion to the branch that deploys stays human.

**Attribution**: see `.source`.

---

## What this skill does NOT do

It owns no ticket cycle. Every worker runs the canonical `void-implement` skill, whole, once per
ticket, specialist panel included. If you find yourself writing "then the worker runs the tests,
then reviews..." inside autopilot, stop: that behaviour has one owner, and two copies drift until
a ticket gets a different standard depending on how it was started.

It never merges on a flag. Not on the command line, not because the checks are green, not because
the diff is small. Consent to a machine merge is a durable declaration in the programme --
`mergeGate: union-reviewed` together with a `deployBranch` -- and there is no `--auto-merge` on
any path. Under `mergeGate: human` a ready pull request goes to a person; that wait is by design
and never counts toward the streak that stops the loop. Promotion from the integration branch to the one that deploys stays human
under both gates.

It never merges a change to the machinery that judges merges. A pull request touching
`.github/**`, `scripts/independent-review-check.mjs`, `.void/program.md`, `packages/core/hooks/**`
or the verdict hook's source goes to a person with the file named (`protected-path`). The programme
adds paths through `autopilot.protectedPaths`; nothing removes from that floor.

It never closes, cancels or deletes a ticket, and it never touches `main`, the secrets or the
repository settings.

---

## Consent and target

The run takes no argument. `.void/program.md` names the progress provider, its scope, the base and
the `autopilot` block, so there is nothing to ask: not which ticket, not which provider.

That file is also the consent, and consent is never inferred. An absent `.void/program.md`, a
`status` other than `executing`, an `autopilot` block that is missing or unreadable, or
`autopilot.enabled: false` all mean the same thing -- say so and stop. `void-harness autopilot next`
refuses the same cases; inventing a target claims tickets nobody agreed to hand over.

---

## The cursor between code and model

The model renders narrow, typed judgments; the policy stays in the code. Agents keep their whole
freedom over the work itself -- ranking, implementing, resolving a conflict, reading a diff. At
each decision point their answer is closed, and the CLI admits it against a schema before anything
acts. An answer that does not fit is a refusal naming the field, never an interpretation.

| Decision point | Judgment the model renders | Policy the code applies |
|---|---|---|
| Is a ticket workable | `readiness`: `ready`, `needs-enrichment` or `ambiguous`, with a reason | only `ready` gets a slot |
| What comes next | `queue`: ordered entries, each with a justification and a footprint | the head takes a free slot unless it collides |
| A conflict after ejection | `conflict`: the conflicting `headSha`, `mechanical` or `semantic`, with a reason | `semantic` waits for a human |
| A review | `review`: the `headSha` read, round 1 or 2, `blocking[]` each with location, scenario and correction, `advisory[]` | a blocking finding without a scenario is invalid; no merge without a clean verdict on the exact head; two rounds at most |

Slots, collisions, review rounds, stops, resumption and the merge are the kernel's. No agent may
skip a step, merge, or decide that a refusal does not apply to it.

---

## Four roles, one subject each

**Curator.** Decides what is worth doing next. Touches the tracker, never code.

**Orchestrator.** Runs the loop. Evaluates no ticket, edits no code, reads no diff.

**Workers**, one per slot. Each carries one ticket from claim to an open pull request, in its own
worktree, by running `void-implement` whole.

**Reviewer.** The independent pass of `void-implement`, in a fresh context, on the exact head SHA of
the pull request. There is no second review at merge time: this verdict is what GitHub checks.

A role that starts doing another's job is the failure this split exists to prevent: an orchestrator
that "just looks at the diff" becomes a reviewer nobody bounded, and a worker that posts its own
verdict is a self-review GitHub reads as independent.

---

## Curator

Read the real state of the project before ranking anything: the programme, the specs and plans in
flight, the code they touch, open pull requests, recent merges, tickets waiting on a human.

Walk the tracker in this order: **Todo, then Backlog, then Triage.** Rank by what the project needs
-- what unblocks other work, what extends the work in flight, what removes a real risk -- not by
the priority label. The label is somebody's past guess; the ranking is today's reading of the
project.

- **Realign the tracker with the ranking.** Change priority or status so the tracker says what the
  queue says, and leave on every ticket you move a justification of one or two sentences. A move
  without a reason is indistinguishable from a mistake.
- **Enrich before ready.** A ticket too vague to implement goes through `void-ticket` before it can
  be declared `ready`. One that stays ambiguous after that is `ambiguous`: it is set aside with its
  reason, not guessed at.
- **Name the ground.** Every queued entry carries a footprint: the paths it will touch, at least
  one. A ticket without one is not admitted; the kernel routes on footprints and cannot protect
  ground nobody named.
- **Never close, cancel or delete.** Not a duplicate, not an obsolete ticket, not one you are sure
  about. Say so in a comment and leave the decision to a person.
- **Re-rank after every merge.** A merge changes what is relevant next, so the queue is only valid
  until the next one lands.

Return the queue as the typed `queue` judgment, at most sixteen entries. The curator can run in the
orchestrator's session or as its own agent; either way its output is data the kernel admits, not an
instruction the orchestrator follows.

---

## Orchestrator

The loop is one question asked again and again: `void-harness autopilot next --json`, with the
tracker state on stdin. The command reads the programme, GitHub, the shared git state and the stop
signal itself; GitHub is the authority on a merge, so no agent reports it.

What you pipe in is the tracker as you observed it -- `void-harness autopilot --help` gives the
shape: `schemaVersion: 1`, the curator's `queue`, every ticket in scope with its provider status,
`humanWait`, pull request, branch, footprint and the raw `readiness` attached to it, the `recent`
outcomes of this run, the `liveWorkers` you actually have, and `quota` (`low` once the runtime
reports its limit is near). Pass judgments through raw; the kernel admits each one where it is
used, so one malformed answer refuses its own decision and nothing else.

Act on each returned action, then ask again:

| Action | What you do |
|---|---|
| `assign` | claim the ticket (In Progress, assigned), run `autopilot fingerprint --before <ticket> --branch <its branch>`, create or reuse its worktree, spawn its worker |
| `wait` | nothing; the reason says who is working |
| `hand-back-to-worker` | give the ticket back to its worker, alive or respawned in the same worktree, with the reason and the pull request |
| `mark-human-wait` | record it in `recent` with its `reason`, put the decision's `humanWaitLabel` on the ticket, comment the reason and detail, free the slot; keep reporting its pull request and footprint, which hold its ground until that pull request merges or closes |
| `enable-auto-merge` | `gh pr merge <n> --auto --match-head-commit <headSha>` on that pull request, never `--admin` |
| `rerun-review-check` | `gh run rerun <run> --failed`: the `independent-review` job failed before the verdict landed on this head; twice at most per run, then `review-check-reruns-exhausted` |
| `requeue` | the same command, to put an ejected head back in the queue; the kernel bounds how often |
| `drain` | take nothing new; keep acting on the tickets in flight |
| `freeze` | stop acting, at once |
| `recap` | write the final recap and end the run |

A pull request observed merged has no action: move its ticket to Done, clean its worktree, count it
in `recent`, and ask the curator to re-rank. `refusals` name judgments the kernel would not admit:
send each back to the agent that produced it.

**Spawning.** Every worker gets its worktree before it starts, at the durable location the
doctrine's worktree rule names, reused when its branch already has one. A worker never chooses its
own checkout and never works in the main one. When the project uses the cockpit presentation
described in the harness's native supervision guide, each worker and reviewer is launched once in
its own surface to the right of the orchestrator; without it, workers are native subagents. The
presentation shows the loop; it never grants a permission, a proof or a merge.

**The fingerprint.** A worktree isolates the working tree, the index and `HEAD`, and nothing else:
the local config and the files it includes, the stash, tags, notes, remotes, the local base and
deploy branches, replace refs, `hooks/` and `info/` are one set for every worktree. Only the upstream
of the ticket's own branch is left out, which is what its push writes. So start each worktree from
`origin/<base>` and never move a local base branch while units are in flight. The baseline
recorded at `assign` is written once: a second `--before` for the same ticket is refused, so a unit
cannot re-record the state it left as the state it found. It is compared by the worker before it
pushes, with `autopilot fingerprint --after <ticket>`, and again by the kernel before it arms a
merge. A changed or missing baseline sends the ticket to a human, unpublished; only that person
deletes the record.

**No state lives in the session.** Who holds which ticket comes from the tracker (status, assignee,
pull request link, the human-wait label); the rest comes from GitHub. The label is the one every
decision names in `humanWaitLabel`: `autopilot.humanWaitLabel` when the programme declares it,
`void:human-wait` otherwise; report `humanWait` as that label's presence, nothing else. After a restart -- an OS
update, a cut, a saturated context -- the first `next` rebuilds the slots from those two sources,
and a ticket already held is resumed, never seated twice. Report each ticket's branch and pull
request whenever they exist, whatever its status: a ticket still ready but with a branch or a pull
request is a unit in flight, and the kernel resumes it instead of seating a second worker. A
ticket whose state is ambiguous goes to a human rather than being relaunched.

**Judgments live on the pull request.** The reviewer's verdict and a worker's conflict class are
comments carrying a machine block: two HTML comment markers around a fenced JSON value. The verdict
is written only by `void-harness autopilot verdict`, which posts it together with the
`void/independent-review` status; `next` believes a verdict comment only when that status on the
same head agrees. The conflict class is the block `void-harness autopilot judgment conflict-class`
prints for the JSON on its stdin. `next` reads both from GitHub and admits them again, so the
tracker you pipe in never carries them and a restart loses nothing.

---

## Workers

Given: one ticket id, its worktree, its branch, the programme's plan and spec. The worker re-fetches
the complete ticket itself; it never works from a summary.

It runs `void-implement` whole in that worktree. When its proofs are green it runs
`autopilot fingerprint --after <ticket>`, pushes its own branch, opens one pull request towards the
base, and moves the ticket to In Review. The reviewer's pass is that cycle's independent review; its
blocking findings come back as a hand-back and are corrected as a batch, per `void-implement`.

On a hand-back the worker reads the reason: failing checks, blocking findings, a conflict, or a
base that moved. It updates its branch by merging the base into it,
never by rewriting pushed history, re-runs its proofs, and pushes again.

May: run every `void-implement` pass whose predicate fires, run its own gates, apply a migration in
dev/local only, push its own branch without force, and open or update its own pull request.

May not: enable auto-merge, merge anything, post the `void/independent-review` status or re-run its
job, move a ticket to Done, close or cancel a ticket, touch another ticket's branch or worktree,
prune the mission journals, or write the git state the repository shares -- `refs/stash`, tags,
notes, remotes, the repository config.

---

## Reviewer

Spawned by the orchestrator when the kernel answers `wait` with `awaiting-review`, in a fresh
context, pinned to the head SHA of the pull request. One full pass.

**What blocks.** Only what is wrong or dangerous, with a concrete scenario: incorrect behaviour, a
vulnerability, an unstable or empty proof, a broken consumer. Each blocking finding names its
location, the scenario and the correction. Everything else is advisory. The number of blocking
findings measures nothing; a pass that files four advisories and blocks on none is a good pass.

**Advisories** go into a single Triage issue per ticket and never come back into the loop.

**Rounds.** After a correction, round 2 checks only the blocking points of round 1 against the new
diff; it opens no new general reading. Still blocking after round 2, the kernel hands the ticket to
a human with the finding. The kernel counts rounds on GitHub, one per head whose
`void/independent-review` status failed, not from the round a verdict announces: a reviewer
restarted without memory cannot reopen the count. After an update on the base, the same targeted check covers the new diff
only.

**Publishing the verdict.** Pipe the typed `review` judgment, with the `headSha` it read, into
`void-harness autopilot verdict --pr <number>`. It is the only path: it refuses a head the pull
request has moved past, posts the verdict comment, then the `void/independent-review` status on
that head (`success` with no blocking finding, `failure` otherwise), and re-runs the
`independent-review` job when its completed run disagrees, since a status event starts no
workflow. Never post the comment or the status yourself: a hook refuses both, and the kernel would
not believe a comment the status does not confirm. Any new push changes the head SHA and needs a
new verdict.

---

## Conflicts and the merge queue

When the base has a merge queue, GitHub rebuilds the combined commit of every pull request ahead
and reruns the required checks, `independent-review` included, before it merges. Two tickets green
alone and broken together cannot reach the base.

A pull request ejected from the queue whose head still passes its checks and carries a clean
verdict has nothing for its worker to fix: the kernel answers `requeue`, at most twice for the same
head, then sends the ticket to a human. An ejected head whose own checks fail goes back to its
worker as failing checks. A pull request in conflict with the base goes back to its worker. The
worker classifies the conflict as the typed `conflict` judgment on the conflicting head, posted
through `autopilot judgment conflict-class`: `mechanical` it resolves, re-runs
its proofs and pushes; `semantic` -- two intents that disagree -- it leaves alone, and the kernel
sends the ticket to a human. A worker never picks a side of a semantic conflict to keep the loop
moving.

**Serial fallback.** Without a merge queue, merges run one at a time: the oldest ready pull request
(or the one already merging) holds the turn, is updated on the base when it is behind, re-checked,
merged, then the next. Same guarantee, lower throughput. The kernel keeps the turn; you do not.
It holds only if the base refuses a pull request that is not up to date, so `next` checks that the
base requires it (classic protection or a ruleset) and refuses the tick, naming the fix, when
nothing readable says so.

---

## Stopping

**Drain.** Requested by a person (`void-harness autopilot stop --drain`, from any pane) or reached
on its own: nothing ready or preparable, quota low, or three tickets in a row handed to a human
(a pull request waiting only for a human merge gate is not one).
The loop takes nothing new, carries the tickets in flight to a merge or a human wait, closes its
agents, cleans the merged worktrees, and writes the recap.

**Now.** `void-harness autopilot stop --now`. Everything freezes. Nothing is lost: the state is in
the tracker and GitHub, and a later run resumes from there.

The stop file stays until someone deletes it; a new run starts only once it is gone.

**The recap.** What merged, what waits and why, the advisory issues created, and the time each
ticket took. It is the account a person reads when they come back; write it from observed state,
never from memory of the session.

---

## Red flags

| Rationalization | Reality |
|---|---|
| "The checks are green, enable auto-merge myself" | Only `enable-auto-merge` from the kernel arms a merge, and only on the SHA it names. |
| "The worker already reviewed its diff" | Self-review is not independent. The reviewer is a separate context on the exact SHA. |
| "I posted the status, the check will pass" | A status triggers no workflow. Re-run the `independent-review` job. |
| "That advisory matters, block on it" | Blocking needs a scenario where it is wrong or dangerous. Otherwise it goes to the Triage issue. |
| "This duplicate ticket can just be closed" | The curator never closes. Comment, and leave it to a person. |
| "P1 on the label, so it goes first" | The ranking reads the project, not the label. Justify the move on the ticket. |
| "Both tickets touch different folders, seat them together" | Different folders, same lockfile is still a collision. The kernel decides. |
| "The conflict is semantic but I see what they meant" | A semantic conflict waits for a human. |
| "I remember which worker had which ticket" | Rebuild from the tracker and GitHub. The session is not the state. |
| "The PR is gone from the list, it must have been merged" | Only a merged pull request observed on GitHub is a merge. |

---

## The cluster engine, until its removal

The previous engine -- one integration pull request per cluster, reconciled and granted by the
`plan`, `orchestrate`, `reconcile` and `grant` subcommands -- still ships while the loop proves
itself on a real batch. `workflows/autopilot.workflow.js` and `references/codex-subagents.md` drive
it. Do not start it for new work unless a person asks for it by name; it is removed once the loop
has passed that batch.

---

## Composition

Upstream: `void-ticket` authors and enriches the tickets and the programme descriptor. Per ticket:
`void-implement`, entire, once, in the worker's worktree. The merge belongs to GitHub under
`mergeGate: union-reviewed`, to a person under `mergeGate: human`, and to a person always for the
branch that deploys.
