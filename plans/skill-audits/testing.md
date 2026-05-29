---
skill: testing
status: draft
strategy: distill
target_loc: 400
phase: B
depends_on: [tdd]
composes_with: [mutation-testing, typescript-strict, hexagonal-architecture]
matrix_row: plans/skill-decision-matrix.md#testing
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `testing`

## Need

Without `testing`, TDD's RED step lacks technique: tests mock the world, fixtures balloon, the test pyramid inverts, integration tests get faked as unit tests. `testing` codifies what makes a *good* test: real code over mocks, factories over `beforeEach`, behavior over implementation, pyramid respected.

## Decision matrix anchor

- **Wins**: how to express a test once you know what to test. Mocking strategy, fixture design, test pyramid placement, integration vs unit choice
- **Loses to**: `tdd` on **when** to write the test (always: before). `migrations-safety` on testing DB changes
- **Cannot decide**: whether a feature deserves a test (TDD's call: yes, always, in strict mode). Production architecture
- **Composes with**: `tdd` (provides the cycle), `mutation-testing` (validates the test quality)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Kent C. Dodds "Common Testing Mistakes" + Testing Library philosophy | https://kentcdodds.com | reviewed | kept (test behavior not implementation, query by accessible role) |
| James Shore "The Art of Agile Development" testing chapter | https://www.jamesshore.com/v2/books/aoad2/testing_without_mocks | reviewed | kept (sociable tests + minimal mocks, infrastructure wrappers) |
| citypaul testing notes | citypaul/.dotfiles | reviewed | partially kept |
| superpowers test patterns | superpowers/skills | reviewed | partially kept (verify-output rules) |
| Vitest docs | https://vitest.dev | reference | tactical (vitest-specific patterns in pack-monorepo) |
| Playwright docs | https://playwright.dev | reference | tactical (E2E patterns in pack-monorepo) |

## Adaptation strategy

`distill`. Core skill is framework-agnostic; framework specifics (Vitest config, Playwright setup) live in `pack-monorepo` or `pack-nextjs-pwa`.

## Hard rules (draft)

- Tests cover *behavior*, not implementation. No assertions on private internals
- Mocking is the last resort. Real code first (pglite for DB, MSW for HTTP boundary, invoke Server Actions directly)
- One assertion intent per test. Multiple `expect` lines OK if they assert the same behavior
- Factories > `beforeEach` for test data. `beforeEach` reserved for environment setup
- Naming: describe the *behavior*, not the function. `"retries failed operations 3 times"` over `"test retry"`
- Test pyramid respected: many unit tests (pure functions), some integration (boundary + real DB), few E2E (critical user paths)
- Fixtures live in `tests/fixtures/`, never inline if larger than 5 lines
- No `console.log` left in tests. No `.only` / `.skip` committed (CI fails on detection)

## Modes — none

## Companion hooks

- `no-only-no-skip` (pre-commit) — fail if `.only` / `fdescribe` / `xit` appears in staged diff
- `no-test-mocks-db` (pre-commit, configurable) — warn if vitest/jest `mock(...)` references DB modules

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- MSW vs custom adapter for HTTP boundary mocking? Lean MSW.
- Snapshot testing — useful or banned by default? Lean banned-by-default with documented exception process (UI regression only).
