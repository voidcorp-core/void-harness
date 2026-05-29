---
name: writing-plans
description: Turn an approved spec into an executable plan. Each step has goal, dependencies, verification gate, TDD mode, expected commit messages. Resume point updated as steps complete. Linked to spec and to its execution. Use after brainstorming approves a spec.
---

# writing-plans — voidcorp craftsman edition

The spec answers "what should we build." This skill answers "in what order, with what gates, and where to resume if a session ends." Plans live on disk. Every implementation step declares its TDD mode. Verification gates between steps prevent regressions.

**Attribution**: see `.source`. Primary source: superpowers/writing-plans, adapted for void-harness.

---

## When to invoke

Invoke immediately after `voidcorp:brainstorming` approves a spec. The plan is the next deliverable before any code.

Do NOT invoke without an approved spec. If you find yourself wanting to plan without a spec, that means brainstorming was skipped — go back.

---

## Plan structure

A plan is a markdown file at `plans/YYYY-MM-DD-<topic>-plan.md`. Frontmatter:

```yaml
---
title: <topic>
date: YYYY-MM-DD
status: in-progress  # in-progress → executing → done
spec: docs/specs/YYYY-MM-DD-<topic>.md
author: <user> + Claude/Codex
high_risk: false  # set true if the plan touches payment, auth, prod data migration, security-sensitive code → triggers autoplan recommendation
---
```

Then sections:

1. **Goal** — one paragraph from the spec
2. **Steps** — numbered, each with the structure below
3. **Review checkpoints** — explicit points where the user reviews work-to-date
4. **Resume point** — pointer to the next step to execute (updated as steps complete)

---

## Step structure

Each implementation step has this shape:

```markdown
### Step N — <imperative subject>

- **Goal**: <one sentence>
- **Depends on**: [step-3, step-5] (or "none")
- **TDD mode**: strict | souple | exploratory
- **Verification gate**: <what must pass before moving to step N+1>
- **Expected commits**:
  - `test: <reproducing or new behavior>`
  - `feat: <implementation>` (or `fix:` / `refactor:` per `commit-discipline`)
- **Notes**: <constraints, gotchas, hook implications>
```

### TDD mode declaration

Every implementation step states its mode. Examples:

- **strict** — new business behavior, hotfix on payment surface, refactor that changes payment behavior
- **souple** — glue at integration boundary covered by higher-level test, framework wiring
- **exploratory** — spike, POC, throwaway script

The declared mode flows into `tdd-guard` enforcement at execution time. If mode is missing, the plan is incomplete.

### Verification gate

Each step's gate states which checks must pass before moving on. Examples:

- `tsc --noEmit && vitest run --filter checkoutCart`
- `pre-commit hooks dry-run on staged set` (composes with `tdd-guard`, `tigerstyle-check`, `no-any-grep`, etc.)
- `mutation testing score ≥ 90%` (strict mode steps with critical surface)

The gate is observable. The user sees the output before the next step begins.

---

## Review checkpoints

For non-trivial plans (≥ 5 steps), declare 1–2 explicit checkpoints where the user reviews work-to-date.

```markdown
### Checkpoint A — after Step 4

User reviews the domain layer (Steps 1–4) before proceeding to the adapters layer.

Stop here. Run `voidcorp:verification-before-completion`. Wait for user signal to proceed.
```

Checkpoints prevent "I shipped 10 steps before you noticed step 3 was wrong."

---

## Resume point

The last section. Updated by the execution skill as steps complete. Format:

```markdown
## Resume point

**Next step**: Step 5 (Implement Stripe adapter)

**Completed**:
- ✅ Step 1: Domain models (commit `feat: domain Order + LineItem + Money`)
- ✅ Step 2: OrdersPort interface (commit `feat: OrdersPort port interface`)
- ✅ Step 3: In-memory adapter (commit `feat: in-memory OrdersAdapter for tests`)
- ✅ Step 4: checkoutCart use-case (commits `test:` + `feat:`)

**Pending**:
- ⏳ Step 5: Stripe adapter
- ⏳ Step 6: Server Action boundary
- ⏳ Step 7: UI Server Component
- ⏳ Step 8: E2E happy-path test
```

The next session reads the resume point and continues. We used exactly this pattern to ship Phase B and Phase C of the harness itself.

---

## Plan self-review

After writing the plan, scan for:

1. **Placeholders** — any TBD / TODO / vague steps? Fix.
2. **Missing verification gates** — every step has one? Fix.
3. **Missing TDD mode** — every implementation step declares one? Fix.
4. **Unrealistic dependencies** — does step N actually need step N-1, or could they parallelize?
5. **Missing resume point** — present and correct as "Next step: Step 1"?
6. **Frontmatter `spec:`** — links back to the approved spec?

Fix inline. Then user-review gate.

---

## User-review gate

Ask the user to review the plan before execution begins:

> "Plan written and committed to `plans/<file>.md`. Please review and let me know if you want changes before we start executing."

Wait for response. If changes requested, make them and re-run self-review.

---

## Transition to execution

After plan approval, transition to:

- **`superpowers:executing-plans`** for sequential execution with review checkpoints
- **`superpowers:subagent-driven-development`** for plans with parallelizable independent steps

These remain external — they are solid, no improvement vector. The harness's job ends at "approved plan." Execution is theirs.

Resume-point updates happen during execution (the executing skill mutates the plan file).

---

## High-risk plans — autoplan recommendation

If `high_risk: true` in the frontmatter, recommend running `gstack:/autoplan` after the plan is written but before execution begins.

`autoplan` reviews the plan via CEO / eng / design / DX gates with auto-decisions and surfaces taste decisions for the user. It catches design issues that brainstorming may have missed.

Set `high_risk: true` when the plan touches:

- Payment / billing surface
- Authentication / authorization changes
- Production data migration (composes with `migrations-safety`)
- Security-sensitive code (secrets, auth tokens, PII)
- LLM call sites with user-controlled input (composes with `security-guidance` LLM section)

---

## Composition with other skills

- **Upstream — `brainstorming`**: the approved spec is the input.
- **Downstream — `superpowers:executing-plans` or `superpowers:subagent-driven-development`**: takes the plan, runs the steps.
- **With `tdd`**: per-step mode selection lives in the plan.
- **With `code-review`**: review checkpoints declared in the plan are honored.
- **With `verification-before-completion`**: the plan's "Done" criteria feed the completion checklist.
- **With `gstack:/autoplan`**: optional review for high-risk plans.
- **With `commit-discipline`**: each step states the expected conventional-commit message.

---

## Anti-rules

- MUST NOT plan without an approved spec.
- MUST NOT skip TDD mode declaration per implementation step.
- MUST NOT skip verification gates per step.
- MUST NOT skip the resume point.
- MUST NOT skip the spec link in frontmatter.
- MUST NOT execute the plan (downstream skills do that).

---

## Final rule

```
Approved spec → plan written → self-review → user approves → transition to executing-plans.
Otherwise → it is not voidcorp writing-plans.
```

The plan is the contract between sessions and between agent and user. Make it explicit.
