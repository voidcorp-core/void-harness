---
skill: refactoring
status: draft
strategy: distill
target_loc: 400
phase: B
depends_on: [tdd, testing]
composes_with: [code-review, hexagonal-architecture, domain-driven-design]
matrix_row: plans/skill-decision-matrix.md#refactoring
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `refactoring`

## Need

Without an enforced refactor discipline, refactoring slides into rewriting (behavior changes) or never happens at all (technical debt compounds). `refactoring` codifies Tidy-First moves, separates Tidyings from Behavior Changes (Beck 2023), and keeps tests green at every step.

## Decision matrix anchor

- **Wins**: any change that improves structure without changing observable behavior. Tidy-First moves
- **Loses to**: `tdd` if any behavior changes. Refactoring stops at the boundary of behavior change
- **Cannot decide**: whether a refactor is worth the cost (escalates to user — taste call). New design (defers to `hexagonal-architecture`, `domain-driven-design`)
- **Composes with**: `tdd` (R step), `code-review` (suggests refactors)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Kent Beck "Tidy First?" 2023 | https://www.oreilly.com/library/view/tidy-first/9781098151232/ | book | foundation (separate Tidyings from Behavior Changes, commit independently) |
| Martin Fowler "Refactoring" 2nd ed. 2018 | https://martinfowler.com/books/refactoring.html | book | foundation (catalog of named refactors with mechanics) |
| citypaul refactor notes | citypaul/.dotfiles | reviewed | partially kept |

## Adaptation strategy

`distill`. Beck's Tidyings + Fowler's catalog. Two modes (strict / souple) mirror `tdd`'s strict/souple split.

## Hard rules (draft)

- Tidyings (renames, extracts, inlines, reorderings) commit SEPARATELY from behavior changes. Never mix in one commit
- Tests stay green at every step. If a refactor breaks tests, it has changed behavior — back out, recategorize as `tdd` work
- Named refactors only (Fowler catalog). Hand-rolled "restructure this somehow" is a Red Flag — pick a name, do it mechanically
- Refactor before adding a feature if the feature would be hard. Refactor after if it surfaces structure. Never refactor "because the code is ugly" without a triggering task
- The R step of TDD's cycle delegates here

## Modes

- `strict`: every Tidying gets its own commit, named after the Fowler refactor. Anti-rustine in full force
- `souple`: Tidyings can be grouped if mechanical and trivial (e.g., a batch of renames). Behavior changes still separate

## Companion hooks

- `tidying-commit-prefix` (commit-msg) — warn if a commit message mixes "refactor:" and "feat:" / "fix:"

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- AST-based refactor detection (true "extract method") vs pattern-based — first iteration relies on commit-message discipline
