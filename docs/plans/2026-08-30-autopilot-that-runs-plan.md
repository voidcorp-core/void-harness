---
title: An autopilot you launch and walk away from
date: 2026-08-30
status: in-progress
spec: docs/specs/2026-08-30-expert-team-execution.md
author: Folpe + Claude
high_risk: true
---

# Plan — an autopilot you launch and walk away from

## The end state, in Folpe's words

> `mode autopilot 6h`

One command. It picks what is worth doing, works each unit through `void-implement`, chains them
for the declared duration, and hands back one PR with a journal a person can read. It stops on
its own when the base goes red, when the budget is spent, or when there is nothing ready.

**At the end of this iteration that command works.** Everything below is ordered so that is true
after slice 2, and slices 3 and 4 make it better rather than make it work.

## Why it does not work today, measured on 2026-08-30

An attended run was launched against a real pool. It never reached the first commit.

- **The decision core exists and has no caller.** `chain.ts` is 259 lines with 225 lines of tests:
  `parseChainBudget`, `resolveChainBudget`, `planChainStep`, `renderMergeJournal`, every stop
  reason. `program.ts:300` already parses `chainBudget` with a two-hour default. Nothing calls any
  of it. **The design is not missing; the loop is.**
- **Every input is hand-assembled.** The skill says "hydrate observations and pipe them in". That
  is one sentence for a dozen steps it documents nowhere. Roughly twenty tool calls went into
  reverse-engineering `ReservationReceipt`, `RunState`, `LeaseMarker` and `TrackerObservation`
  from TypeScript interfaces, and two were wrong on the first attempt.
- **The errors do not name the field.** A missing `base.branch` produced
  `Cannot read properties of undefined (reading 'branch')`. The CLI knows the shape it wants and
  does not say it.
- **The review budget collapses the cluster.** `review-budget.ts:102` carries
  `|| deferred.length > 0`: once one ticket is deferred every later one is too, whether it fits or
  not. A high-risk ticket at the head therefore reduces any pool to a cluster of one. Deliberate
  (the cluster is a prefix of the board, never a cherry-pick) and documented nowhere.

## Slices

### Slice 1 — The machine tells you what it wants

- **Goal**: nobody reverse-engineers a contract from a `.ts` file again. The CLI emits the exact
  shape for each step, and refuses with the field name rather than a TypeError.
- **Depends on**: none
- **TDD mode**: strict
- **Scope**:
  - `autopilot scaffold <plan|start|status>` prints the exact JSON the next step accepts, with
    every field present and placeholder values that fail validation loudly rather than silently;
  - every parse failure names the field, what was expected and how to obtain it, in the
    problem/cause/fix shape the rest of the CLI already uses;
  - the skill gains the hydration procedure it currently compresses into one sentence: which
    tracker read fills which field, in order, with the lease marker rendered by the CLI rather
    than by hand.
  - The CLI still contacts nothing. It describes what it needs; the skill remains the only layer
    that talks to the tracker.
- **Verification gate**: a run is driven end to end from `scaffold` output alone, without opening
  a single source file. That is the gate: **if you have to read `.ts` to fill a payload, this
  slice failed.**
- **Expected commits**:
  - `test(autopilot): every rejected payload names the field it wants and where to get it`
  - `feat(autopilot): the machine prints the shape it accepts, so nobody reads the types`

### Slice 2 — `mode autopilot 6h`

- **Goal**: the command exists and drains for the declared duration.
- **Depends on**: slice 1
- **TDD mode**: strict for the loop's decisions, souple for the wiring
- **Scope**:
  - the invocation parses a duration and passes it through `resolveChainBudget`; an invocation
    longer than the declared `chainBudget` refuses, and the refusal says to change the descriptor;
  - the loop: take the next unit, create its worktree, run **`void-implement` entire** on it,
    merge into the union branch, verify the base, then ask `planChainStep` whether to continue —
    the four existing stop reasons are honoured, not re-derived;
  - `renderMergeJournal` is called for real, and the PR body carries it;
  - a run that stops mid-chain leaves the lease, the branches and the cursor exactly where they
    are, and says which unit it stopped on and why.
- **Verification gate**: `mode autopilot 30m` on a real pool of at least two units produces one
  integration PR whose journal names each unit, its commit range and the evidence it merged on.
  A deliberately reddened base stops the chain before the next unit starts, proven by running it.
- **Expected commits**:
  - `test(autopilot): a chain stops on a red base before it takes the next unit`
  - `feat(autopilot): drain a pool for the declared duration, one implement per unit`
- **Notes**: `void-implement` is composed whole, once per unit. If this slice starts describing
  what a worker does inside a ticket, it has grown a second ticket cycle and must be cut back.

### Checkpoint — after slice 2

**Folpe launches `mode autopilot 6h` himself and walks away.** What comes back is the measure.
Nothing below starts before that.

### Slice 3 — It picks what is worth doing

- **Goal**: selection stops being board order plus a budget, and starts being value.
- **Depends on**: the checkpoint
- **TDD mode**: strict
- **Scope**: what "most valuable" means, decided from a real run choosing badly rather than from
  taste; the review budget's prefix rule (`|| deferred.length > 0`) is either documented as
  intended or replaced, and either way it stops silently collapsing a pool to one.
- **Verification gate**: on a pool where board order and value disagree, the run takes the
  valuable one and says why.
- **Notes**: deliberately after the checkpoint. Designing a value function before watching one
  run choose is how the last plan grew from two slices to eight.

### Slice 4 — It notices when it stops being good

- **Goal**: the chain stops on measured drift, not only on a red base.
- **Depends on**: slice 3
- **Scope**: point the existing apparatus (`apps/eval-harness`, `gut-skill.ts`, `--sensitivity`)
  at the run rather than at the skill.
- **Notes**: **deferred on purpose, and named so it is not silently lost.** A run that stops on a
  red base or a spent budget is already usable; this makes a six-hour one trustworthy. It is the
  part that genuinely is large, and bundling it with the rest is the mistake that got the whole
  chain cut on 2026-08-30.

## What is NOT in this plan

The four shipped guards — DEV-677, DEV-673, DEV-665, DEV-664 — and DEV-678. They are not the
programme; they are the **fuel** for slice 2's first real run. Fixing them by hand would spend
the only realistic pool this iteration has.

## Execution handoff

| key | slice | depends on | gate |
|---|---|---|---|
| 1 | The machine tells you what it wants | — | — |
| 2 | `mode autopilot 6h` | 1 | **human: Folpe launches it and walks away** |
| 3 | It picks what is worth doing | checkpoint | — |
| 4 | It notices when it stops being good | 3 | — |

## Open decision

**One**, and it blocks nothing before slice 2's gate: `chainBudget` defaults to two hours and an
invocation may only shorten. So `mode autopilot 6h` refuses unless the descriptor declares six.
That is the consent rule working as designed, and it means Folpe sets the ceiling once in
`.void/program.md` rather than per invocation. Confirm the ceiling before slice 2 ships.

## Resume point

**Next**: slice 1.

**Completed**: none. Plan written 2026-08-30 after an attended run failed to reach its first
commit.
