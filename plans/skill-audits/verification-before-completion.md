---
skill: verification-before-completion
status: draft
strategy: distill
target_loc: 200
phase: D
depends_on: []
composes_with: [every other skill]
matrix_row: plans/skill-decision-matrix.md#verification-before-completion
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `verification-before-completion`

## Need

Without this gate, "task complete" claims are LLM hallucinations: the code typechecks but isn't tested, the tests pass but for the wrong reason, the feature works in one viewport but not another, the lint warning was silenced not fixed. `verification-before-completion` is the final pre-flight checklist.

## Decision matrix anchor

- **Wins**: every "task complete" claim. Pre-flight checklist before reporting done
- **Loses to**: nothing — it is the final gate
- **Cannot decide**: what "complete" means functionally (the task itself defines that)
- **Composes with**: every other skill (runs after)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| superpowers/verification-before-completion | superpowers/skills | reviewed | kept as primary |
| citypaul completion checklists | citypaul/.dotfiles | reviewed | partially kept |

## Adaptation strategy

`distill`. Slim skill, mostly a checklist with the discipline of "actually do every item, not just claim done."

## Hard rules (draft)

- Final checklist before reporting completion:
  1. Typecheck passes (`tsc --noEmit`)
  2. Tests pass (`vitest run` or equivalent, including new tests)
  3. Lint passes
  4. Coverage acceptable (per `tdd` mode)
  5. Hooks pass (pre-commit chain dry-run)
  6. Both mobile and desktop viewports verified for any UI change
  7. Observability hooks present for any new business logic
  8. Security review check for any boundary/auth change
  9. Documentation updated if any convention changed
  10. Commit message includes "why"
- Skipping an item REQUIRES explicit reason in the completion report
- "Tests pass" means observed passing AFTER the last code change — not "they passed earlier"

## Modes — none

## Companion hooks

- `pre-commit typecheck+test` (already declared) materializes items 1-3 mechanically

## Composition

- Runs LAST. After all other skills have done their work.
- Composes with `commit-discipline` (the completion → commit message handoff)

## Anti-rules — see matrix
## Verification checklist for the skill itself — TBD
## Open questions

- Item 6 (mobile + desktop) — block or warn if one is skipped? Lean block in strict `frontend-design` mode, warn otherwise.
