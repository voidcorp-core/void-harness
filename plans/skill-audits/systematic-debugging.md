---
skill: systematic-debugging
status: draft
strategy: compose-gstack + distill
target_loc: 250
phase: D
depends_on: [tdd, observability]
composes_with: []
matrix_row: plans/skill-decision-matrix.md#systematic-debugging
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `systematic-debugging`

## Need

Without `systematic-debugging`, an agent applies the first plausible fix to a bug and moves on. Root cause stays buried, the bug recurs in a different form. `systematic-debugging` enforces the Iron Law: no fix without root cause + a failing test that reproduces.

## Decision matrix anchor

- **Wins**: any bug, test failure, unexpected behavior. Root-cause investigation before fix
- **Loses to**: `migrations-safety` on migration-specific failures. `observability` on missing-logs cases (fix visibility first)
- **Cannot decide**: whether to ship a fix without root cause (Iron Law: no). The fix itself (delegates to `tdd`)
- **Composes with**: `tdd` (write the failing test that reproduces, then fix)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| gstack `/investigate` | gstack/skills | reviewed | kept as primary (4 phases: investigate → analyze → hypothesize → implement, Iron Law) |
| superpowers/systematic-debugging | superpowers/skills | reviewed | composed/cross-referenced (similar discipline) |

## Adaptation strategy

`compose-gstack` + `distill`. Wrap gstack `/investigate` as the primary mechanism. Add void-harness-specific composition: enforce TDD-style failing test reproducing the bug before any fix lands.

## Hard rules (draft)

- 4 phases mandatory: investigate (gather evidence) → analyze (find pattern) → hypothesize (testable theory) → implement (fix + verify)
- Iron Law: no fix without root cause identified AND a failing test reproducing the bug
- "It works now" is not a root cause. Suspect cosmic-ray fixes
- Bug fix commit pairs: `test: reproduce <bug>` then `fix: <root cause description>` — never combined
- Investigation evidence captured in the bug's tracker/issue, not lost in conversation

## Modes — none

## Companion hooks — none

## Composition

- Composes UPSTREAM of `tdd`: investigation produces the failing test that drives the fix
- Composes UPSTREAM of `observability`: if root cause is "we can't see what happened", fix visibility first

## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Heuristic for "root cause vs symptom" — defer to first 10 real bug fixes, refine matrix from real cases
