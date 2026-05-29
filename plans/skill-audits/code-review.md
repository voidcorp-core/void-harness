---
skill: code-review
status: draft
strategy: distill
target_loc: 350
phase: B
depends_on: []
composes_with: [tdd, typescript-strict, every other skill]
matrix_row: plans/skill-decision-matrix.md#code-review
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `code-review`

## Need

Without a structured review skill, "review my diff" produces vague feedback (style nits + maybe a bug). `code-review` provides a checklist + dimensions (correctness, tests, structure, security, perf, readability) and operates at two modes: strict (block on any finding) and souple (surface findings, user decides).

## Decision matrix anchor

- **Wins**: pre-commit / pre-PR critical pass over a diff. Defects, missing tests, structure issues, security flags
- **Loses to**: `senior-reviewer` agent for deep multi-aspect review. `security-reviewer` agent on security-specific concerns
- **Cannot decide**: whether to ship (user). Architecture changes outside the diff scope
- **Composes with**: `tdd` (verifies the cycle was respected), `typescript-strict` (verifies types), all hedges

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| citypaul `pr-reviewer` skill | citypaul/.dotfiles | reviewed | kept (dimensions + checklist) |
| superpowers/requesting-code-review | superpowers/skills | reviewed | partially kept (how to request a useful review) |
| gstack `/code-review` | gstack/skills | composed (called from this skill for diff analysis) | wrapped |
| gstack `/codex` review mode | gstack/skills | composed (second-opinion mode) | wrapped |

## Adaptation strategy

`distill` + `compose-gstack`. Distill citypaul's checklist; compose gstack `/code-review` and `/codex review` for the actual diff analysis when at high effort levels.

## Hard rules (draft)

- Review dimensions in order: correctness → tests → security → structure → readability → performance
- Block on: missing test for new behavior, type error, security flag, architectural boundary violation
- Surface but do not block: naming nits, structure suggestions, performance hints
- In strict mode: any blocker fails the review. In souple mode: blockers surfaced, user decides
- Review evidence in PR: which dimensions passed, which were skipped (with reason), what was changed in response
- Composes with `senior-reviewer` and `security-reviewer` agents for deep passes — the skill orchestrates, the agents execute

## Modes

- `strict`: pre-PR before landing. All dimensions checked. Blockers fail. PR description must include the review evidence
- `souple`: in-progress feedback during work. Dimensions checked at user discretion

## Companion hooks

- `pre-PR-review-evidence` (pre-push) — warn if PR body lacks review-evidence block

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Integration with gstack `/code-review --comment` (post inline comments on GitHub) — at strict mode default? Lean yes.
