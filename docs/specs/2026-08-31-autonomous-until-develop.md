---
title: Autonomous until develop
date: 2026-08-31
status: in-design
author: Folpe + Claude
ticket:
related:
  - docs/specs/2026-08-30-expert-team-execution.md
  - docs/plans/2026-08-30-autopilot-that-runs-plan.md
---

# Autonomous until develop

## The objective, in Folpe's words

> Launch autopilot for a duration. Everything happens automatically, with no human intervention.
> The human eye is only at the point where code goes to production: someone looks at what is on
> `develop` — in a browser if it is an app, in the code by asking the LLM what was implemented —
> and promotes it.

Two consequences, both load-bearing:

- **No human gate below `develop`.** Not in `void-implement`, not in `void-autopilot`, not per
  ticket. A run that stops to ask has failed at its purpose.
- **The harness owes a readable account.** Autonomy nobody can audit afterwards is autonomy
  nobody will use twice. Producing that account is part of this spec, not a nicety.

## What is wrong today, measured

`void-implement` and `void-autopilot` are markdown. Under autopilot both run with nobody present,
and the official guidance is explicit about what that costs:

> "Claude will follow the instruction most of the time, but when under pressure, in a long
> session, in an ambiguous situation, or due to a prompt injection, the model can fail to follow a
> prompted rule." — *Anthropic, Steering Claude Code*

> "When there's something that absolutely must not happen, an instruction is the wrong tool. A
> real guardrail needs to be deterministic."

Observed on 2026-08-31, in this repository, by a session doing exactly that: driving one autopilot
run by hand took 47 minutes, and 24 exported functions of the autopilot library were never called
— `planWorktreeSetup`, `orderWorkers`, `buildReconcilePlan`, `verifyRange`, `buildPublishPlan`,
`renderPullRequestBody`, `judgeMergeGrant`. Every step was re-performed by hand from prose. The
merge grant, hardened twice that week, is consulted by no code path at all.

The diagnosis is narrow. The harness has 24 wired hooks and 46 CLI commands, all deterministic;
its enforcement floor works and blocked writes that day. **One layer is misplaced: unattended
orchestration lives in prose.**

## The rule this spec adopts

> **What is supervised may be prose. What runs unattended must be code.**

One criterion, testable, applied once. It is not a mandate to rewrite 41 skills.

## What the machine owes: four proofs, not fifteen passes

Every `void-implement` pass carries two things: a *judgment* only a model makes, and an
*obligation* that the pass ran. Today prose carries both, so a skipped pass leaves no trace —
there was never an expectation to violate.

Requiring evidence for all fifteen passes would be ceremony: a machine refusing a ticket over a
UX pass on a parser change teaches everyone to route around it. So the obligation attaches to
**four outcomes**, each mechanically checkable, each corresponding to a defect this project
actually paid for:

| proof | checked how | the defect it closes |
|---|---|---|
| the panel spoke before the writing | a `specialist.completed` at `pre-implementation` precedes the first `lead-writer` event | the panel existed and was never convened (2026-08-30) |
| a test was red before it was green | sealed evidence of the red run, plus commit order | tests written after the fact prove nothing about intent |
| the full suite passed on the final tree | sealed evidence bound to the final diff hash | a suite proven on a tree that no longer exists |
| the shipped surface was actually run | sealed evidence of the dogfood, with its output | six defects shipped past typecheck, 2 700 tests and five green checks (2026-08-06) |

The machinery for all four already exists. `verify.ts` seals the exact argv, the working-tree
diff hash before and after, the output and the environment. The event stream records the panel and
the writer. `review-loop.ts` already refuses when a required specialist completion is missing or
stale. **Nothing declares what a ticket owes** — that declaration is the missing piece.

### Two are absolute, two escalate

Copying a pattern wholesale is how a design stops being one. These four are not equal:

- **Absolute — the green suite, and the panel before the writing.** No debt, no exception. A red
  suite accepted as debt is broken code on `develop`.
- **Escalating — red-before-green, and the dogfood.** A surface that genuinely cannot run here (a
  deploy, a remote service) is declared as typed debt, the chain continues, and it surfaces in the
  account.

### The proof is written by the executor, never claimed by the worker

Audited from `prime-agent` (Prime Intellect), whose control boundary is sharper than the one this
spec first proposed:

> "The Python REPL is the model-facing control environment. Typed host requests return
> authoritative operations to the TypeScript session." The model "cannot directly modify state; it
> must request operations through typed host calls that the deterministic runtime validates and
> executes."

The difference matters. A gate that *checks a worker's claim* can be passed by a worker that
claims well. A runtime where the worker can only **request** an operation, and the executor
produces the record, removes the possibility of a false claim rather than detecting it.

So no proof in this spec is ever a field a worker fills. Each is written by the thing that
performed the work: `mission verify` seals the command it ran and the tree it ran against, the
dispatch records the specialists it convened, the reconciler records what it merged. A worker
reporting "the suite passed" is not evidence and is not read as any. **Absence of a record is
absence of the act**, which is the only reading that survives an agent under pressure.

## Gates at three levels, because the last one is not enough

The state of the art is a hybrid, and it names the failure of gating only at the end:

> "End-stage gating can mask upstream planning flaws rather than prevent them."
> — *AgentField, shipping production code with 200 autonomous agents*

So:

1. **Inner loop, per unit.** The worker corrects itself against its own gates, bounded to three
   attempts. Bounded because an unbounded self-correction loop is how a run spends six hours on
   one ticket.

   **Bounded by three budgets, not one.** `prime-agent` runs its autonomous mode "within
   configured turn, token, and time budgets"; this project has only time. A six-hour run with a
   single clock is one runaway worker away from producing nothing: it consumes the whole budget
   inside one unit and the chain never learns why. Turns and tokens are per-unit ceilings whose
   exhaustion is a typed action, exactly like a failed gate.
2. **Collection gate.** The reconciler refuses to merge a range whose mission does not carry the
   two absolute proofs. This is the point that *authorizes*, and the fail-closed rule lives where
   authorization happens — the same placement that fixed the severity partition and the merge
   grant this week.
3. **Final verifier.** After the run, an agent checks each acceptance criterion against the
   codebase as it now stands.

### A failed gate escalates; it does not stall

This is the correction that makes the objective reachable. A refusal that stops the chain puts a
human back in the loop, which is the outcome this spec exists to remove. A failure therefore
produces a **typed recovery action** and the run continues:

- `RETRY_MODIFIED` — same approach, corrected, within the inner-loop bound.
- `SPLIT` — the unit was too large; the remainder becomes its own unit.
- `ACCEPT_WITH_DEBT` — escalating proofs only, recorded with a severity.
- `STOP_CHAIN` — an absolute proof failed, or the base is red. The existing chain stop reasons
  already cover this and are not re-derived.

Debt is a record, not a feeling: it carries the unit, the proof that failed, a severity, and the
reason. Later units receive it, and it appears in the account.

## Where the orchestration lives

The cycle stops being prose that a model may or may not follow, and becomes a **deterministic
script** that calls the CLI functions and spawns agents only where judgment is required. Claude
Code's `Workflow` primitive exists for exactly this: the orchestration plan and intermediate
results live in script variables rather than in a context window.

The inversion is the point. Today the skill *is* the procedure and the code assists it; afterwards
the script *is* the procedure and the skill documents it. **Prose cannot drift from code when
prose is no longer the mechanism** — which closes the whole class rather than its instances, and
this repository found three instances of that class in a single day.

The model stays where judgment belongs: inside the workers, inside the specialists, inside the
final verifier. It leaves the places where obedience was standing in for a mechanism.

## The account, and the only human gate

`humanGates` per ticket is abandoned for this programme. The one gate is the promotion of
`develop` to the branch that deploys, which `production-downstream` already refuses to do
autonomously. The field remains in the descriptor for consumers who want it; this programme
declares none.

What a person reads at that gate is the final verifier's report, and it is the same artifact for
both uses:

- what was asked, per unit, and whether the codebase now satisfies it;
- what merged, with its commit range and the evidence it merged on;
- every typed debt, with its severity and its reason;
- what could not be verified, named rather than omitted.

A merge journal lists commits. This states outcomes against intentions, which is what a person
promoting to production actually judges.

## Acceptance criteria

- [ ] A unit whose mission lacks an absolute proof is not merged into the union branch, and the
      refusal names the missing proof.
- [ ] A unit whose escalating proof failed IS merged, carrying a typed debt record with a severity.
- [ ] The inner loop is bounded, and exhausting it produces a typed action rather than a stall.
- [ ] A full run from launch to integration PR completes with zero human interaction.
- [ ] The chain's existing stop reasons are consumed, not re-derived.
- [ ] The final verifier's report names, per unit: what was asked, whether it holds, and every
      debt. Absence of evidence is reported as absence, never as success.
- [ ] The orchestration is a script; no step of it depends on a model reading a numbered list.
- [ ] No proof is a field a worker fills; each is written by the component that performed the act,
      and a worker's own report of success is not read as evidence.
- [ ] A unit that exhausts its turn or token ceiling yields a typed action, and the run continues
      with the remaining budget intact.
- [ ] The declared-mechanism-has-a-caller test is green: no exported autopilot function is
      unreachable from production code.

## Non-goals

- Rewriting the other forty skills. The rule scopes to what runs unattended.
- Removing `humanGates` from the descriptor contract. This programme stops using it; the field
  stays for consumers who want it.
- Merging into the deploying branch autonomously, under any grant. That gate is human by design
  and this spec does not touch it.
- A headless or scheduled backend. The run is still launched by a person; it is what happens after
  the launch that becomes autonomous.
- Reworking how the harness learns from its own runs. `prime-agent` pairs an **immutable base
  prompt** with durable supplemental state its `/refine` loop may update from reviewed
  trajectories — a sharper split than `void-learn`'s, and worth taking. It is deliberately not
  taken here: this spec is about a run being trustworthy, and folding a learning loop into it is
  how a scope doubles. Filed rather than absorbed.

## Sources

- Anthropic, *Steering Claude Code: skills, hooks, rules, subagents* — what an instruction does
  not guarantee, and that a real guardrail is a hook or a permission.
- AgentField, *Beyond Vibe Coding: shipping production code with 200 autonomous agents* — three
  nested gate levels, typed recovery actions over rejection, and the measured finding that the
  same architecture scored 95/100 with two very different models.
- Augment Code, *Harness Engineering for AI Coding Agents* — constraints, feedback loops and
  quality gates as three distinct layers.
- Prime Intellect, *prime-agent* (`packages/coding-agent/docs/architecture.md`) — a model-facing
  control environment where state changes only through typed host calls the deterministic runtime
  validates, and an autonomous mode bounded by turn, token AND time budgets.
