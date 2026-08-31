---
title: Autonomous until develop
date: 2026-08-31
status: in-progress
spec: docs/specs/2026-08-31-autonomous-until-develop.md
ticket:
author: Folpe + Claude
high_risk: true
---

# Plan — autonomous until develop

## Goal

`autopilot 6h` runs to the end without anyone present, and the only human moment is reading an
account of what landed on `develop` and deciding whether to promote it. The order is settled in
the spec: the proofs come first, the twenty-four unwired functions are wired **by** writing the
orchestration script, and the final verifier ships inside this iteration.

The MVP cut is slice 1. From that slice on, a range cannot reach the union branch without a sealed
proof that the suite passed on the tree being merged — a real safety property, shippable alone,
with nothing else in place.

## Steps

### Step 1 — A range cannot merge without a sealed green suite

- **Goal**: the mission declares that it owes a passing suite, `mission verify` is the only thing
  that can satisfy it, and the collection point refuses a range that does not carry it.
- **Depends on**: none
- **TDD mode**: strict — this authorizes a merge
- **Scope**:
  - a `RequiredProof` declaration compiled with the mission plan, listing what this unit owes;
  - the satisfaction check reads sealed evidence only: the argv, the diff hash of the tree it ran
    against, and the outcome. A worker-reported success is not a candidate;
  - **the declaration carries the expected invocation, not only the expected outcome.** `mission
    verify -- <command...>` takes whatever command the caller names, so sealing an argv does not
    constrain it: a worker requesting the suite on one file produces evidence that is sealed,
    fresh, correctly bound — and worthless. The check compares the sealed argv against the
    programme's declared `autopilot.verifyCommands` before it reads the outcome. Without this the
    proof is the worker's claim laundered through the executor, and slice 1 has no safety property;
  - **a third evidence state, `unproducible`,** sealed by the executor with its reason: the runner
    itself exited non-zero, timed out, or the worktree was gone. Absence today conflates a red
    suite, a crashed runner and a worker that never ran it, and one flaky crash would end a
    six-hour run at minute twelve — the stall this plan exists to remove;
  - the reconciler refuses a range whose mission carries no satisfying evidence, naming the proof;
  - evidence bound to a different tree than the one being merged is **stale**, which is unproven,
    which refuses — the `review-stale` rule applied to proofs.
- **Verification gate**: a probe merges synthetic ranges — sealed evidence on the right tree
  (merged); evidence on another tree (refused, naming staleness); a worker claim with no evidence
  (refused); **evidence sealed for a narrowed command** (refused, naming the declared command it
  does not match); an empty declaration (states which, and does not pass by vacuity). Plus: which
  tree the hash binds to is named, and the case where a sibling unit merged first is probed.
  `pnpm verify` green.
- **Expected commits**:
  - `test(autopilot): a claimed green suite is not a proof, and a stale one is not either`
  - `feat(autopilot): a range reaches the union branch only with sealed evidence for the tree it merges`
- **Notes**: the evidence machinery exists — `verify.ts:138` seals argv, before/after diff hash,
  output and environment, and `.void/program.md:25` already declares `verifyCommands`. What is new
  is the **declaration of what is owed** and the **comparison of the sealed argv against it**.
  **Honest shippability**: what ships alone here is a tested refusal with no production caller
  until step 5. Calling it a live safety property would reproduce the twenty-four-unwired-functions
  defect one function deeper, in the plan written to close it. It is sequenced first because
  everything else rests on it, not because it protects anything on its own.

### Step 2 — The panel is proven to have spoken before the writing

- **Goal**: the second absolute proof, from events that already exist.
- **Depends on**: the `RequiredProof` type from step 1 only. **Parallel-eligible with step 3** —
  this reads the event stream, step 3 reads sealed evidence, and they share nothing else.
- **TDD mode**: strict
- **Scope**: the proof is satisfied when a `specialist.completed` at `pre-implementation` precedes
  the first `lead-writer` event in the mission stream. A mission with the events in the wrong order
  fails it; a mission with no specialist events fails it.
- **Verification gate**: three synthetic event streams — correct order (satisfied), inverted
  (refused), panel absent (refused). Replayed against a real mission from `.void/machine/runs/`.
- **Expected commits**:
  - `test(mission): a panel that spoke after the writing did not brief anybody`
  - `feat(autopilot): prove the brief preceded the code, from the stream rather than from a report`
- **Notes**: this is the defect measured on 2026-08-30 — sixteen specialists compiled and never
  convened. The proof is what stops it recurring silently.

### Step 3 — A missing escalating proof merges with typed debt

- **Goal**: the two escalating proofs, and the record that lets a run continue instead of stalling.
- **Depends on**: step 1
- **TDD mode**: strict — this is what keeps the run autonomous
- **Scope**:
  - red-before-green and the dogfood become declared proofs whose absence does **not** refuse;
  - a `DebtRecord` carrying the unit, the proof that failed, a severity and the reason, written by
    the gate and never by the worker;
  - debt travels: later units receive it, the merge journal renders it, the run continues;
  - a typed action set — `RETRY_MODIFIED`, `SPLIT`, `ACCEPT_WITH_DEBT`, `STOP_CHAIN` — with
    `STOP_CHAIN` reusing the existing chain stop reasons rather than adding a parallel vocabulary;
  - **`unproducible` evidence does not stop the chain.** A red suite is `STOP_CHAIN`; evidence the
    executor could not produce is a retry then a skipped unit. The merge refuses in both cases; the
    run only ends in one;
  - **every stop carries a disposition**, not only a reason, cause and fix: how many units merged
    and are kept, how many remain ready, and that relaunching resumes rather than redoes. That
    unstated sentence is the difference between relaunching and hand-driving;
  - what a brief carries forward is bounded: the most recent debts, or filtered by severity, never
    all of them — unit N's brief carrying N-1 units of debt is quadratic growth on the hottest path
    of a long run.
- **Verification gate**: a unit with no dogfood evidence merges, its debt appears in the journal
  with its severity, and the next unit's brief carries it. A unit missing an **absolute** proof
  still refuses, proving the two classes did not collapse into one.
- **Expected commits**:
  - `test(autopilot): a run does not stall on a proof it is allowed to owe`
  - `feat(autopilot): a failed gate escalates into a typed action and a recorded debt`
- **Notes**: the distinction is the whole design. A green suite accepted as debt is broken code on
  `develop`, and an unrunnable deploy surface declared as debt is honest reporting.

### Step 4 — A unit is bounded by turns and tokens, not only by the clock

- **Goal**: one runaway worker can no longer consume a six-hour run.
- **Depends on**: step 3 (the typed actions)
- **TDD mode**: strict for the ceilings, souple for the wiring
- **Scope**: per-unit turn and token ceilings beside the existing time budget; exhaustion yields a
  typed action, never a silent truncation; the remaining run budget is unaffected by one unit
  spending its own.
- **Verification gate**: a unit driven past its turn ceiling yields a typed action and the chain
  takes the next unit with the remaining time intact. Probed, not reasoned.
- **Expected commits**:
  - `test(autopilot): a unit that exhausts its turns hands back rather than eating the run`
  - `feat(autopilot): bound a unit by turns and tokens beside the clock`
- **Notes**: taken from `prime-agent`, which bounds its autonomous mode by turn, token AND time.
  This project had only time, which is one runaway worker away from producing nothing in six hours.

### Step 5 — The orchestration is a script, and the twenty-four get their caller

- **Goal**: `autopilot 30m` runs from launch to integration PR with zero human interaction.
- **Depends on**: steps 1–4
- **TDD mode**: souple for the script, strict for any pure function it needs that does not exist
- **Scope**:
  - the cycle becomes a deterministic script: pool → worktree → `void-implement` → gate → merge →
    suite on the merged base → chain decision → publish. Control flow in code, judgment in agents;
  - it calls what already exists — `planWorktreeSetup`, `orderWorkers`, `buildOrchestrationPlan`,
    `buildReconcilePlan`, `verifyRange`, `assessProofs`, `buildPublishPlan`,
    `renderPullRequestBody`, `judgeMergeGrant`, `planPostCheckAction`, **`recoverRemote`** —
    rather than reimplementing any of it. `recoverRemote` is in scope so the script re-observes and
    resumes itself: resume works today but costs a hand-assembled JSON observation, which puts it
    out of reach of the person this plan is written for;
  - it takes the existing lease before taking a unit and refuses to start when one is held, so two
    launches on one pool cannot both run;
  - the skill stops being the procedure and becomes its documentation: when to run it, how to read
    what comes back, what a stop means.
- **Verification gate**: a real run on a two-unit pool, **no human interaction between launch and
  the PR**. And the declared-mechanism-has-a-caller test goes green, which is the mechanical proof
  that nothing was left unwired. Two adversarial cases, because one happy run proves one
  trajectory: a second launch against a held pool refuses, and a run killed between merge and
  publish resumes rather than re-merging. `pnpm verify` green on the integration SHA.
- **Expected commits**:
  - `test(skills): the autopilot skill describes a script rather than being one`
  - `feat(autopilot): drive the cycle from a script, so obedience stops standing in for a mechanism`
  - `refactor(skills): document the run instead of narrating it`
- **Notes**: the twenty-four are wired here and nowhere else. Wiring them first, with no caller in
  mind, would be inventing a second orchestration beside the one that matters.

### Step 5b — The six hours are readable while they happen

- **Goal**: from a phone, mid-run, tell alive from stalled and name the last unit merged.
- **Depends on**: step 5
- **TDD mode**: souple
- **Scope**: the chain journal is persisted after **every** decision rather than only at the end;
  the integration PR opens as a **draft at the first merged unit**, so its body is the live
  surface; each decision emits a heartbeat carrying timestamp, unit taken, budget spent and budget
  left, so silence longer than one unit's ceiling is itself readable as a stall.
- **Verification gate**: a run is killed at minute two; a person reading only the PR, without a
  terminal, can say it stopped and name the last unit. A healthy run shows progress advancing.
- **Expected commits**:
  - `test(autopilot): a run that died is not indistinguishable from a run that is working`
  - `feat(autopilot): publish the journal as the run goes, not once at the end`
- **Notes**: no new computation. The journal is already produced between every unit and thrown away
  until the end. **This closes the plan's worst defect**: its step 5 gate — "no human interaction
  between launch and the PR" — is satisfied by a run that stalls silently at minute ten and is
  contradicted by nothing.

### Checkpoint A — after Step 5b

**Folpe launches `autopilot` himself and walks away.** This is the first moment the objective is
testable, and what comes back is the measure. Its acceptance includes what he can see **during**
the run, not only what returns: mid-run, from a phone, he can tell alive from stalled and name the
last unit merged. Stop. Run `void-verify`. Wait for his signal.

### Step 6 — The account a person promotes on

- **Goal**: the artifact the one human gate reads.
- **Depends on**: Checkpoint A
- **TDD mode**: strict for the report's contract, souple for the agent that fills it
- **Scope**:
  - a final verifier reads each unit's acceptance criteria against the codebase **as it now
    stands**, not against what the worker said it did;
  - the report names, per unit: what was asked, whether it holds, the commit range, the evidence it
    merged on, every debt with its severity, and what could not be verified — as absence, never as
    success;
  - it lands where the promotion happens: attached to the integration PR and readable without a
    terminal;
  - **a verdict block leads it**: units merged, criteria met versus unmet, highest debt severity,
    and either "nothing blocking" or the blockers named. Six unranked per-unit blocks are not a
    five-minute decision;
  - when the run touched a user-facing surface, a pointer to **look at it** — a preview URL or the
    command that renders it. At that gate a person judges the feature, not the code;
  - the programme stops declaring per-ticket `humanGates`; the field stays in the contract for
    consumers who want it, and `production-downstream` remains the gate that a machine cannot pass.
- **Verification gate**: on a run where one acceptance criterion is deliberately left unmet, the
  report says so and names it. A run with a debt shows the debt. `pnpm verify` green.
- **Expected commits**:
  - `test(autopilot): an unverified criterion is reported as unverified, never as met`
  - `feat(autopilot): the account a person reads before promoting to production`
  - `docs(program): the only human gate is the promotion, so the ticket gates go`
- **Notes**: a merge journal lists commits; this states outcomes against intentions. That is the
  difference between an autonomous run someone tolerates and one they promote.

## Review checkpoints

- **Checkpoint A — after Step 5** (above). The first runnable end-to-end run, launched by Folpe.
- **Final** — after Step 6, Folpe promotes `develop` to `main` using the report, which is the
  acceptance test of the whole plan.

## High-risk review

`high_risk: true` — steps 1, 3 and 5 change what authorizes a merge, and step 6 changes what a
human sees before production. Run `void-plan-review` in `all` mode after approval and before
execution.

## Resume point

**Next step**: Step 1 — a range cannot merge without a sealed green suite.

**Completed**: none. Plan written 2026-08-31 from the approved spec, after the three ordering
decisions were settled.

**Pending**: steps 1–6, plus the `void-plan-review` pass the risk flag calls for.


## Review findings folded in, 2026-08-31

Two independent lenses in fresh context, both **NOT CLEARED**. Every finding above with a bold
lead-in came from one of them; what follows is what remains as tasks rather than as scope changes.

**P2 — the on-ramp is untouched.** A consumer needs five or six preconditions before a first run:
init, tickets, a `program.md` with an `autopilot` block, a connected tracker, and server-side
branch protection positively observed. Each is justified — this surface merges code — but nothing
tells a newcomer which one they are missing. Preflight already computes exactly this and is only
reachable inside a run. Expose it as a standalone readiness check. Not in this plan's scope; filed.

**P3 — a bare `autopilot` points a human at a stdin-JSON command.** Its no-subcommand fix should
name the entry point a person types.

**Not adopted, and why.** The Eng lens proposed splitting the `RequiredProof` type into its own
half-slice so steps 2 and 3 parallelise. The dependency note is right and is recorded on step 2,
but a slice whose whole content is a type declaration is the horizontal phasing this skill's own
doctrine rejects. The type lands in step 1 with its first consumer.

**What the review cost, and what it caught.** Both lenses hit their turn ceiling exploring and had
to be told to answer from what they had — the exact defect documented the day before, committed by
the person who documented it, while sending them to read five files each. Yesterday's specialists,
handed a context pack, answered first time. Same model, same contract, same ceiling; the pack was
the only variable. That is an unintentional controlled experiment and it lands on the side of
step 5.
