---
title: An expert team that challenges before it writes
date: 2026-08-30
status: in-progress
spec: docs/specs/2026-08-30-expert-team-execution.md
ticket:
author: Folpe + Claude
high_risk: true
---

# Plan — an expert team that challenges before it writes

## Goal

Make the panel real. Sixteen canonical specialists are compiled for both runtimes and the
per-ticket cycle does not convene them; when it does, they read blind. This plan turns the
spec's brief-first cycle into shipped behaviour, in an order where each slice is verifiable on
its own and the earliest slice is the one everything else rests on.

## What was measured on 2026-08-30, and what it changes

Written down because three of these overturn what the spec assumed, and a plan built on the
assumption would sequence the work wrong.

- **The controller already does most of brief-first.** `packages/mission-engine/src/orchestration/controller.ts`
  has phases `preparation | review | correction`, a `run-preparation-correction` action, and
  `mission dispatch` returns `invoke-specialists` at `stage: 'pre-implementation'` as its FIRST
  action. Probed live: `mission start --mode team` then `dispatch` selected five specialists
  before any writing. The mechanism is not missing; it is not obeyed.
- **`void-implement` contradicts itself.** Its "Canonical team orchestration" section says to
  drive the controller and take every next action from it. Its numbered cycle puts TDD at pass 5
  and Review at pass 10. Following the prose means writing first; following the controller means
  briefing first. That contradiction is the actual work of slice 2.
- **The specialists read blind.** All five reported `ENOENT ... posix_spawn 'rg'`: `Grep` and
  `Glob` are dead, and their whitelist is `Read, Grep, Glob`. None could read the diff. With
  `maxTurns: 2` they spent both turns exploring and returned a transition sentence; re-prompted
  to answer without reading further, all five returned dense, conforming completions — one of
  them a real security hole the test suite did not see. **DEV-443 is therefore a hard
  prerequisite, not a speed optimisation**, and the spec already says so at line 75.
- **The completion contract has no field for verification criteria.** It carries `findings`,
  `evidenceRequests`, `limitations`. The spec requires each specialist to return *how it will
  verify* its finding; there is nowhere to put it.

## Slices

Vertical, each shippable and observable on its own. Slice 1 is the MVP cut: without it every
later slice ships a panel that cannot see.

### Step 1 — Give a specialist eyes

- **Goal**: a convened specialist reads the diff and the touched files without exploring, and a
  specialist whose declared tool is broken says so instead of guessing.
- **Depends on**: none
- **Tickets**: DEV-676, DEV-443
- **TDD mode**: strict for the pack builder (pure input → bounded pack), souple for the runtime
  wiring
- **Scope**:
  - restore `rg` in the subagent environment, or make `Grep`/`Glob` degrade to a working
    implementation rather than failing on `ENOENT`;
  - compile the bounded context pack: the integrated diff, the touched paths, and the artifacts
    the ticket cites, capped to the declared 12 000-token budget;
  - the envelope carries the pack; the specialist is told not to explore.
- **Verification gate**: convene `security-engineer` on a real diff through
  `mission dispatch`; its completion cites a `path`+`line` it could not have guessed, and its
  `limitations` array is empty. Compare against the same invocation without the pack, which must
  still report the limitation rather than inventing.
- **Expected commits**:
  - `test: a context pack carries the diff, the touched paths and nothing unbounded`
  - `feat(mission): compile the bounded context pack a specialist reads instead of exploring`
  - `fix(agents): a specialist whose search tool is broken reports it rather than reading blind`
- **Notes**: re-evaluate `maxTurns` only AFTER the pack exists, and from measurement — how many
  turns a specialist that does not explore actually consumes. Ten of sixteen declare 2, six
  declare 3; changing them before the pack would be tuning the wrong variable.

### Step 2 — Convene before the first line

- **Goal**: `void-implement` takes its next action from the controller, so the panel speaks
  before anything is written.
- **Depends on**: step 1
- **TDD mode**: souple (skill prose + orchestration wiring), strict for any controller change
- **Scope**:
  - resolve the skill's internal contradiction: the numbered cycle is reordered so the
    pre-implementation dispatch precedes the TDD pass, and the prose stops describing an order
    the controller refuses;
  - the lead writer identity is bound once and every correction returns to it;
  - a mission that ends unfinished calls `mission close` with its reason.
- **Verification gate**: run one real ticket end to end. `mission inspect` shows a
  `specialist.requested` and a matching completion at `stage: 'pre-implementation'` recorded
  BEFORE the first `writer-event`. A test asserts the skill names no pass order the controller
  contradicts, in the family of `test/skills/autopilot-describes-its-gate.test.ts`.
- **Expected commits**:
  - `test(skills): the implement cycle does not describe an order the controller refuses`
  - `refactor(skills): brief before writing, which is the order the controller already applies`
- **Notes**: this is prose against a compiler. The test is what keeps it true, and this repo has
  now twice shipped a skill asserting the opposite of its CLI.

## Out of scope, deliberately

Cut on 2026-08-30, after the plan reached eight slices and three open decisions in one day.
The cause was mechanical: these slices were found by **reading** the code, and reading finds
defects without end. None of them was found by a run that failed. They stay as tickets and
re-enter a plan only when a real end-to-end run shows they block something.

| was | slice | ticket | why it is not here |
|---|---|---|---|
| 3 | A brief carrying its own acceptance criteria | — | speculative: no run has yet cost us the round trip it removes |
| 4 | A refusal that proposes and chooses | — | matters under unattended runs, which slice 8 defers anyway |
| 5 | The x10 fires on every brainstorm | — | independent of this spine; one clause in `void-brainstorm` |
| 6 | One skill owns the design principles | DEV-668 | independent; ready to execute on its own |
| 7 | The three missing specialists | DEV-669, DEV-634 | adding roles to a panel that just learned to see changes nothing yet |
| 8 | The chain, sequential and watched for drift | DEV-670, DEV-673, DEV-674 | larger than 1-7 combined; needs its own plan from a measured baseline |

## Execution handoff

Order key, dependencies, and the human gates. `void-ticket` writes the native relations from
this table and installs `.void/program.md`; the declared Linear provider then owns state.

| key | slice | depends on | tickets | gate |
|---|---|---|---|---|
| 1 | Give a specialist eyes | — | DEV-676, DEV-443 | — |
| 2 | Convene before the first line | 1 | — | **human: one full ticket run, reviewed by Folpe** |

After slice 2, execution **stops**. One real ticket runs end to end through the panel, Folpe
reads it, and what that run actually lacked becomes the next plan. Nothing from the deferred
table re-enters before that.

DEV-666 (63 triage verdicts) is not a slice here. It is backlog curation, which is a human gate
by doctrine, and it feeds this plan rather than depending on it.

## Open decisions

Named rather than resolved, because each would change what gets built and none is mine to
settle alone.

1. ~~**Does the panel really fire on every ticket?**~~ **Settled 2026-08-30 by Folpe, in favour
   of the spec**: the panel is a floor, and what shrinks when a specialist has nothing important
   to say is the lens, not the guest list. `appliesWhen` stops deciding *whether* a specialist
   speaks and starts deciding *how much* it says. Recorded as
   `docs/decisions-log/2026-08-30-panel-is-a-floor-the-lens-shrinks--fcc230d9-3324-42a7-afb8-b4922b0cb0f0.md`.
   Step 2 therefore also changes `routeSpecialists` and the `not-applicable` filter in
   `controller.ts`; step 1 gains the reduced-lens budget alongside the context pack.
2. **What happens to a specialist that never changes an outcome?** The spec says the eval
   apparatus decides, not taste. That apparatus does not exist for this question yet, so until it
   does, nothing retires a role.
3. **Does slice 8 belong in this plan at all?** It is larger than slices 1–7 combined and its
   verification gate is the least specified. My recommendation is to cut it out, ship 1–7, and
   plan it separately from a measured baseline.

## High-risk review

`high_risk: true` — slice 8 touches the merge grant, and slices 1 and 7 change what a
security-sensitive review reads before it judges. Run `void-plan-review` in `all` mode after this
plan is approved and before execution begins.

## Resume point

**Next step**: Step 1 — Give a specialist eyes.

**Completed**: none. Plan written 2026-08-30, not yet approved.

**Pending**: steps 1–8, plus the three open decisions above, of which decision 1 blocks step 2.
