---
skill: brainstorming
status: draft
strategy: distill
target_loc: 350
phase: D
depends_on: []
composes_with: [writing-plans]
matrix_row: plans/skill-decision-matrix.md#brainstorming
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `brainstorming`

## Need

Without a brainstorming gate, an LLM-driven agent will start coding before understanding the intent — producing well-written code for the wrong problem. `brainstorming` exists to enforce: explore intent, identify constraints, propose 2-3 approaches with trade-offs, validate design section-by-section, write the spec, then transition to planning.

## Decision matrix anchor

- **Wins**: any creative task before code. Feature scoping, design discussion, "should we build X this way?"
- **Loses to**: gstack `/office-hours` when the question is "should we build X at all?" (upstream)
- **Cannot decide**: implementation specifics (defers to `writing-plans`). Sub-domain identification (defers upstream)
- **Composes with**: `writing-plans` (downstream)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| superpowers/brainstorming | superpowers/skills | reviewed in depth (used to brainstorm this very harness) | kept as primary source — hard gate, one-question-at-a-time, 2-3 approaches, spec-write, transition to plans |
| gstack `/office-hours` | gstack/skills | reviewed | different niche (upstream "should we build"), composed as predecessor |
| compound-engineering "plan" phase | EveryInc plugin | reviewed | rejected as primary (no clear gate between explore and implement); some pattern reuse (compound-loop reference) |

## Adaptation strategy

`distill`. Rewrite superpowers/brainstorming for void-harness with: no over-engineered filter on trigger (per Section 0bis-discussion: keep simple, user can decline manually), explicit hand-off to `voidcorp:writing-plans` (not superpowers/writing-plans), `docs/specs/YYYY-MM-DD-<topic>.md` location (not `docs/superpowers/specs/`).

## Hard rules (draft)

- One question at a time. Multiple-choice preferred when applicable
- Propose 2-3 approaches with trade-offs before settling. Lead with recommendation
- Present design in sections; approval gate after each
- HARD GATE: no implementation skill invoked, no code written, until the spec is written AND user has approved
- Spec self-review pass after writing (placeholder scan, internal consistency, scope, ambiguity) — fix inline
- User-reviews-spec gate before invoking `writing-plans`
- Transition to `writing-plans` is the ONLY post-brainstorming skill invoked

## Modes — none (it is one rigorous process)

## Companion hooks — none

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Spec location: `docs/specs/` vs `plans/` — defer to consumer's voidcorp.config.json with `docs/specs/` as default
- Visual companion (browser-based) from superpowers — keep or drop? Lean keep, opt-in per session
