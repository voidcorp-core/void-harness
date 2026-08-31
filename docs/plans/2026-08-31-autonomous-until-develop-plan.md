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
  - the reconciler refuses a range whose mission carries no satisfying evidence, naming the proof;
  - evidence bound to a different tree than the one being merged is **stale**, which is unproven,
    which refuses — the `review-stale` rule applied to proofs.
- **Verification gate**: a probe merges two synthetic ranges — one with sealed evidence on the
  right tree (merged), one with evidence on another tree (refused, naming staleness), one with a
  worker claim and no evidence (refused). `pnpm verify` green.
- **Expected commits**:
  - `test(autopilot): a claimed green suite is not a proof, and a stale one is not either`
  - `feat(autopilot): a range reaches the union branch only with sealed evidence for the tree it merges`
- **Notes**: no new evidence machinery. `verify.ts:138` already seals argv, before/after diff hash,
  output and environment. What is new is the **declaration of what is owed**, which is the piece
  the spec identifies as missing.

### Step 2 — The panel is proven to have spoken before the writing

- **Goal**: the second absolute proof, from events that already exist.
- **Depends on**: step 1 (the declaration and the gate)
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
    `STOP_CHAIN` reusing the existing chain stop reasons rather than adding a parallel vocabulary.
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
    `renderPullRequestBody`, `judgeMergeGrant`, `planPostCheckAction` — rather than reimplementing
    any of it;
  - the skill stops being the procedure and becomes its documentation: when to run it, how to read
    what comes back, what a stop means.
- **Verification gate**: a real run on a two-unit pool, **no human interaction between launch and
  the PR**. And the declared-mechanism-has-a-caller test goes green, which is the mechanical proof
  that nothing was left unwired. `pnpm verify` green on the integration SHA.
- **Expected commits**:
  - `test(skills): the autopilot skill describes a script rather than being one`
  - `feat(autopilot): drive the cycle from a script, so obedience stops standing in for a mechanism`
  - `refactor(skills): document the run instead of narrating it`
- **Notes**: the twenty-four are wired here and nowhere else. Wiring them first, with no caller in
  mind, would be inventing a second orchestration beside the one that matters.

### Checkpoint A — after Step 5

**Folpe launches `autopilot` himself and walks away.** This is the first moment the objective is
testable, and what comes back is the measure. Stop. Run `void-verify`. Wait for his signal.

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
