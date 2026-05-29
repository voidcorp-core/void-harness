---
skill: writing-plans
status: reviewed
strategy: distill
target_loc: 300
phase: D
depends_on: [brainstorming]
composes_with: [tdd, code-review]
matrix_row: plans/skill-decision-matrix.md#writing-plans
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `writing-plans`

## Need

Without `writing-plans`, an approved design jumps directly to code. The plan is implicit, dependencies are missed, verification gates between steps are absent, review checkpoints get forgotten, and the order of steps drifts as work proceeds. Worse, sessions end mid-implementation with no shared resume point, and the next session re-litigates the order. `writing-plans` turns an approved spec into an executable plan with explicit sequencing, dependencies, verification gates, and resume points.

## Decision matrix anchor

- **Wins**: turning an approved design into an executable plan. Sequencing, dependencies, verification gates between phases, review checkpoints, resume points for multi-session work
- **Loses to**: `brainstorming` on intent and design choices (the plan does not re-litigate design)
- **Cannot decide**: feature scope (planning is sequencing, not scoping). Architecture (defers to architecture skills consumed at planning time via the spec)
- **Composes with**: `brainstorming` (upstream — produces the spec), `executing-plans` (downstream — keep external in superpowers/gstack), `tdd` (per-step mode selection)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| superpowers/writing-plans | superpowers/skills | reviewed | kept as primary source (proven structure, used to ship Phase A–C of this very harness) |
| superpowers/executing-plans | superpowers/skills | reviewed | KEEP EXTERNAL — we do not vendor execution. Plans transition to it. |
| superpowers/subagent-driven-development | superpowers/skills | reviewed | reference (alternative execution style for parallelizable tasks) |
| citypaul plan templates (in `plans/`) | citypaul/.dotfiles | reviewed | partially kept (sectioning style, numbered steps with verification gates) |
| gstack `/autoplan` | gstack/skills | reviewed | different niche (REVIEWS an existing plan via CEO/eng/design/DX gates). Composes with this skill (autoplan can be invoked after writing-plans to validate) |

## Adaptation strategy

`distill`. Rewrite superpowers/writing-plans for void-harness. Three deliberate changes:

1. **TDD mode per step**: every implementation step declares its TDD mode (`strict` / `souple` / `exploratory`) inline. Why: prevents re-litigation at implementation time and surfaces the cost up front.
2. **Resume points are first-class**: every plan has a "Resume point" section listing where to pick up if a session ends mid-execution. Why: we ship cross-session (we did exactly this in the void-harness build itself).
3. **Verification gates between steps**: each step ends with explicit `tsc --noEmit && test:affected` (and optionally `mutation` in strict mode). Why: catches regressions at the step boundary, not at the end.

## What we keep (verbatim or near-verbatim)

- **Plans are written, not narrated** (superpowers): output is a markdown file in `plans/YYYY-MM-DD-<topic>.md` and committed. Verbal-only plans are rejected.
- **Each step has**: subject (imperative), goal, dependencies on other steps, verification gate, expected commit messages (composes with `commit-discipline`).
- **Verification gates between steps must pass** before moving to the next step. Composes with `pre-commit typecheck+test` hook.
- **Review checkpoints are declared explicitly** (superpowers): no implicit "review at the end." A 5-step plan typically has 1–2 review checkpoints; the user is asked to review work-to-date before proceeding.
- **Plans link back to their spec** (superpowers): the YAML frontmatter `spec:` points to `docs/specs/<spec-file>`. The spec links to its plan. Bidirectional.
- **No code before plan is approved** (superpowers): like brainstorming's hard gate, planning has its own gate — the plan is written, self-reviewed, user-reviewed, then execution begins via `executing-plans` or `subagent-driven-development`.
- **Plan self-review pass** (superpowers, mirrors brainstorming): after writing the plan, scan for placeholders, missing verification gates, unrealistic dependencies, missing resume points. Fix inline.

## What we adapt

- **TDD mode per step (new in voidcorp)**: each implementation step explicitly declares mode. Examples:
  ```markdown
  ### Step 3: Implement checkoutCart use-case
  - TDD mode: strict (new business behavior, payment surface)
  - Goal: ...
  - Verification: tsc --noEmit && vitest run --coverage --filter checkoutCart
  ```
  Why: makes the discipline cost visible at planning; the user can see "this plan is 3 strict + 2 souple + 1 exploratory" and adjust.
- **Resume point is mandatory**: every plan's last section is "Resume point" listing the next step to execute. Updated by the execution skill as steps complete. Why: cross-session shipping.
- **Verification gates compose with hooks** (new): each step's gate maps to specific harness hooks (`pre-commit typecheck+test`, `tdd-guard`, `tigerstyle-check`). Plans state which hooks must succeed at that step. Why: explicit composition surfaces what protects each step.
- **Composition with `autoplan`** (gstack): plans that target high-risk surface (payment, auth, prod migrations) can be reviewed by `autoplan` after writing. Plans include a flag in frontmatter (`high_risk: true`) that triggers an autoplan recommendation. Why: catch design issues without re-litigating brainstorming.

## What we reject

- **Vendoring `executing-plans` into voidcorp**: rejected. superpowers/executing-plans + subagent-driven-development are solid; no improvement vector identified. Keep external; void-harness's `writing-plans` transitions to them.
- **Plans-as-conversations**: rejected. Always written to disk.
- **Implicit dependencies**: rejected. Step N's dependencies on prior steps are explicit in the frontmatter or step header.
- **Plans that combine design and sequencing**: rejected. The spec (from brainstorming) has the design. The plan has the sequence. They are linked but distinct.
- **Pre-defined plan templates that prescribe step count**: rejected. Plan length follows project complexity.

## Hard rules surfaced by this skill

- **Plans live in `plans/YYYY-MM-DD-<topic>.md` and are committed**. Enforced by: SKILL.md + `code-review` flags PRs implementing a spec without a linked plan (for non-trivial work).
- **Every step has a verification gate**. Enforced by: SKILL.md template + `code-review`.
- **Every implementation step declares its TDD mode**. Enforced by: SKILL.md template + plan self-review pass.
- **Plans have a Resume point**. Enforced by: SKILL.md template.
- **No code before plan approval**. Enforced by: SKILL.md gate (mirrors brainstorming).
- **Plans link back to their spec via frontmatter `spec:`**. Enforced by: SKILL.md template.

## Modes — none

The planning discipline is uniform. The plan's content scales to project complexity, but the structure (frontmatter + steps + verification + resume point) is invariant.

## Companion hooks

None. Planning is a process discipline; the verification gates leverage existing hooks (`pre-commit typecheck+test`, `tdd-guard`, etc.) rather than introducing new ones.

## Composition with other skills

- **Upstream — `brainstorming`**: the approved spec is the input. Plans does not re-litigate design.
- **Downstream — `superpowers:executing-plans` or `superpowers:subagent-driven-development`**: takes the plan, runs the steps.
- **With `tdd`**: per-step mode selection lives in the plan.
- **With `code-review`**: review checkpoints declared in the plan are honored.
- **With `verification-before-completion`**: the plan's "Done" criteria feed the completion checklist.
- **With `autoplan` (gstack)**: optional review of the plan via CEO/eng/design/DX gates for high-risk surface.
- **With `commit-discipline`**: each step states the expected conventional-commit message (`feat:`, `fix:`, `refactor:` etc.) so commits align with the plan.

## Anti-rules (what this skill MUST NOT do)

- MUST NOT decide feature scope (that is brainstorming + office-hours).
- MUST NOT decide architecture (architecture skills inform via the spec).
- MUST NOT execute the plan (downstream skills do that).
- MUST NOT skip the spec-link requirement.
- MUST NOT silently allow a step without a verification gate.
- MUST NOT pretend mode selection is "implicit" — every step states its mode.

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ≤ 300 LOC
- [ ] Frontmatter `description` ≤ 200 chars, mentions plan-to-disk + steps with verification gates + TDD mode per step + resume point as headline
- [ ] `.source` file lists superpowers/writing-plans + superpowers/executing-plans (external) + citypaul plan templates + gstack/autoplan
- [ ] No companion hooks needed (process discipline)
- [ ] Plan template published in `packages/core/claude/skills/writing-plans/TEMPLATE.md`
- [ ] Matrix row in `plans/skill-decision-matrix.md` matches this audit note
- [ ] Skill tests in `test/writing-plans/` cover: plan-link-check, missing-verification-gate detection, missing-resume-point detection, missing-spec-frontmatter detection
- [ ] No overlap > 30% with `brainstorming` (this skill = sequence; brainstorming = design)
- [ ] No overlap > 30% with `autoplan` (this skill = author; autoplan = review)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor
- [ ] Audit status moved from `reviewed` → `shipped` after first project consumes the skill

## Open questions

- **Plan template location**: in `packages/core/claude/skills/writing-plans/TEMPLATE.md` (skill-local) vs `templates/plan-template.md` (top-level). Lean skill-local for self-containment.
- **Auto-transition to executing-plans**: explicit user command vs automatic after approval. Lean explicit (matches brainstorming → plans convention).
- **Plan size cap**: should there be a soft cap (e.g., > 20 steps = decompose)? Lean yes, document as advisory rule. Refine after first 10 real plans.
- **Composition with subagent-driven-development**: how does the plan declare "step N can run in parallel with step M"? Lean: explicit `parallelizable_with: [step-3]` field per step. Defer mechanics to first multi-agent plan.
- **High-risk flag mechanics**: who sets `high_risk: true`? Lean: the author (during plan self-review). Document heuristics (payment, auth, prod data migration, security-sensitive code).
