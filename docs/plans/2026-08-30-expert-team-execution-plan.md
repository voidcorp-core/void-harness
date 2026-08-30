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

### Step 3 — A brief that carries its own acceptance criteria

- **Goal**: a specialist returns findings AND the criteria it will verify them by; the writer
  implements against those criteria and checks itself.
- **Depends on**: step 2
- **TDD mode**: strict (contract change, parsed at a boundary)
- **Scope**: add a bounded `verificationCriteria` to the completion contract, validated like
  every other field; a finding without one is `degraded`, never silently accepted; the criteria
  reach the writer's brief; the recap names which were met.
- **Verification gate**: a completion missing the field is rejected with a named cause; a
  ticket run end to end shows each criterion echoed in the verification pass. `pnpm verify`
  green.
- **Expected commits**:
  - `test(mission): a specialist that names no verification criterion is degraded, not accepted`
  - `feat(mission): a brief carries the criteria the writer will be judged on`
- **Notes**: this is what buys speed rather than spending it — the review afterwards confirms
  instead of discovering. If it does not remove a round trip, it has failed and should be
  reverted rather than kept for tidiness.

### Step 4 — A refusal that proposes, chooses, and surfaces

- **Goal**: a specialist that says no never silently blocks; it proposes alternatives, picks
  one, and that choice appears in the recap.
- **Depends on**: step 3
- **TDD mode**: strict
- **Scope**: a `blocked` verdict requires at least one named alternative and a chosen one; the
  recap renders every specialist choice with its author.
- **Verification gate**: a `blocked` completion with no alternative is refused; the recap of a
  real run names each choice and who made it.
- **Expected commits**:
  - `test(mission): a refusal without an alternative is not a usable refusal`
  - `feat(mission): a blocked verdict carries options and the one it chose`
- **Notes**: under an unattended run a block stops the chain while a named choice does not. That
  is the whole reason this step exists, and it is why it precedes any autopilot work.

### Checkpoint A — after Step 4

The panel now convenes before writing, sees the code, carries its own acceptance criteria, and
refuses usefully. Stop. Run `void-verify`. Folpe reviews one full ticket run end to end before
anything else is built on top.

### Step 5 — The x10 fires on every brainstorm

- **Goal**: the ambition pass stops being trapped in the raw-product-idea mode.
- **Depends on**: none (parallel with 1–4)
- **TDD mode**: souple
- **Scope**: `void-brainstorm` line 69 scopes the pressure-test to a raw product idea and line 84
  carries the 10x inside it. The 10x becomes unconditional; the demand pressure-test stays scoped
  to a raw idea, because a technical ticket has no demand to test.
- **Verification gate**: a technical brainstorm produces an ambitious option and a creative
  reframing, not only the safe increment. A clause test pins the unconditional wording.
- **Expected commits**:
  - `test(skills): the ambition pass is not scoped to a product idea`
  - `feat(skills): push the x10 on every brainstorm, since the timid version is the default one`
- **Notes**: `void-implement` must NOT re-open scope as a consequence. A wrong angle returns to
  brainstorm explicitly, which is a named and rare event.

### Step 6 — One skill owns the design principles

- **Goal**: `void-design-principles` exists and is invoked when code is written.
- **Depends on**: none (parallel with 1–4)
- **Ticket**: DEV-668
- **TDD mode**: strict for the hooks, souple for the prose
- **Scope**: single skill owning SRP, OCP, LSP, ISP, DRY, KISS, cohesion, coupling. Dependency
  inversion stays in `void-hexagonal-architecture`. Anything mechanically checkable becomes a
  hook, not prose. The two passing mentions of coupling (`void-plan-review`, `void-testing`) are
  either redirected or removed.
- **Verification gate**: measured overlap < 30% against every existing skill,
  `void-hexagonal-architecture` first; `pnpm anti-bloat:check` green; under 400 lines; and the
  skill is observed firing in invocation telemetry, not merely declared.
- **Expected commits**:
  - `test(skills): every principle is stated so a reviewer can point at it in a diff`
  - `feat(skills): one skill owns the design principles, loaded at the moment they fire`
- **Notes**: the ticket's numbers were wrong until today — DRY was claimed in 16 skills and is in
  0. The gap is absence, not dispersion, so there is almost nothing to remove and everything to
  write. Any coverage number in the skill comes from a replayable command.

### Step 7 — The three missing specialists

- **Goal**: the role that judges prose written for agents exists, plus `backend-engineer` and
  `release-engineer`.
- **Depends on**: steps 1, 2
- **Ticket**: DEV-669
- **TDD mode**: strict for the contracts and the wiring
- **Scope**: three canonical contracts compiled for both runtimes, each declaring its tool
  whitelist (DEV-634). The prose specialist is convened by an observable predicate: the diff
  touches a skill, an agent, doctrine, or a refusal message.
- **Verification gate**: replayed against the five defects in DEV-667, the prose specialist names
  at least three. Each of the three is observed invoked in telemetry.
- **Expected commits**:
  - `test(agents): the prose specialist names the defects that shipped past every gate`
  - `feat(agents): a specialist for the prose this project actually produces`
- **Notes**: strictly after steps 1 and 2. Adding three specialists to a panel that is not
  convened and cannot see takes the count from sixteen to nineteen and changes nothing — the
  ticket says so itself.

### Step 8 — The chain, sequential and watched for drift

- **Goal**: `void-autopilot` chains through a union branch instead of a parallel cluster, and
  stops when the work stops being as good as it was.
- **Depends on**: steps 1–4
- **Ticket**: DEV-670 partially; needs its own decomposition before execution
- **TDD mode**: strict
- **Scope**: sequential chain (union branch, one feature branch per unit, consolidation, one PR);
  wire `planChainStep` / `resolveChainBudget` / `renderMergeJournal`, which today have no
  production caller; point the eval apparatus (`apps/eval-harness`, `gut-skill.ts`,
  `--sensitivity`) at the run rather than at the skill.
- **Verification gate**: a real two-unit chain runs, its journal names what merged on what
  evidence, and an injected quality regression stops it.
- **Expected commits**: to be decomposed — this slice is larger than the others and should
  become its own plan rather than one step.
- **Notes**: the biggest and least specified. It also carries DEV-674 (an advisory still has no
  consumer) and DEV-673 (six classes of diff still granted), both of which land in the same
  files. Do not start it before Checkpoint A.

## Execution handoff

Order key, dependencies, and the human gates. `void-ticket` writes the native relations from
this table and installs `.void/program.md`; the declared Linear provider then owns state.

| key | slice | depends on | tickets | gate |
|---|---|---|---|---|
| 1 | Give a specialist eyes | — | DEV-676, DEV-443 | — |
| 2 | Convene before the first line | 1 | — | — |
| 3 | A brief carrying its criteria | 2 | — | — |
| 4 | A refusal that proposes | 3 | — | **human: Checkpoint A** |
| 5 | The x10 on every brainstorm | — | — | — |
| 6 | One skill owns the principles | — | DEV-668 | — |
| 7 | The three missing specialists | 1, 2 | DEV-669, DEV-634 | — |
| 8 | The chain, sequential and watched | 1–4 | DEV-670, DEV-673, DEV-674 | **needs its own plan** |

Slices 5 and 6 are independent of the 1→4 spine and of each other: they can run in parallel with
it, and they are the two that touch no orchestration code.

DEV-666 (63 triage verdicts) is not a slice here. It is backlog curation, which is a human gate
by doctrine, and it feeds this plan rather than depending on it.

## Open decisions

Named rather than resolved, because each would change what gets built and none is mine to
settle alone.

1. **Does the panel really fire on every ticket?** The spec says the floor is the panel and only
   depth varies. Measured cost is five specialists per ticket at 12 000 tokens each. On an XS
   ticket that is a real bill for three lines of "no trust boundary touched". The alternative —
   a predicate-selected subset — is what the controller already implements. The spec argues the
   floor version; the code implements the subset version. **They disagree, and step 2 forces the
   choice.**
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
