---
skill: writing-plans
status: draft
strategy: distill
target_loc: 300
phase: D
depends_on: [brainstorming]
composes_with: []
matrix_row: plans/skill-decision-matrix.md#writing-plans
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `writing-plans`

## Need

Without `writing-plans`, an approved design jumps directly to code — the plan is implicit, dependencies are missed, verification gates are absent. `writing-plans` turns the spec into an executable plan: sequenced steps, explicit dependencies, verification gates between phases, review checkpoints.

## Decision matrix anchor

- **Wins**: turning an approved design into an executable plan. Sequencing, dependencies, verification gates
- **Loses to**: `brainstorming` on intent and design choices
- **Cannot decide**: feature scope (planning, not scoping). Architecture (defers to architecture skills)
- **Composes with**: `brainstorming` (upstream), `executing-plans` (downstream — kept in superpowers/gstack)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| superpowers/writing-plans | superpowers/skills | reviewed | kept as primary source |
| citypaul plan templates (in `plans/`) | citypaul/.dotfiles | reviewed | partially kept (sectioning style) |
| gstack `/autoplan` | gstack/skills | reviewed | different niche (review of existing plan with CEO/eng/design/DX gates) |

## Adaptation strategy

`distill`. Rewrite superpowers/writing-plans for void-harness. Add explicit gate to invoke `voidcorp:tdd` mode selection at each implementation step.

## Hard rules (draft)

- Plans are written, not narrated. Output is a markdown file in `plans/`
- Each step: subject (imperative), goal, dependencies, verification gate
- Verification gates between steps (typecheck, test, lint) — must pass before moving on
- Review checkpoints declared explicitly (no implicit "review at the end")
- `tdd` mode declared per-step at planning time (strict/souple/exploratory)
- Plans link back to their spec; specs link to their plans

## Modes — none

## Companion hooks — none

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Plan execution still via superpowers/executing-plans? Or distill that too? Lean keep external (it's solid and we have no improvement vector).
