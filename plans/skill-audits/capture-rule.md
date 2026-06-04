---
skill: capture-rule
status: shipped
strategy: original
target_loc: 200
matrix_row: plans/skill-decision-matrix.md#capture-rule
audit_date: 2026-06-04
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `capture-rule`

> Backfilled 2026-06-04: the skill shipped with a `.source` but no audit note,
> in violation of the "one audit note per skill" rule. This closes that gap.

## Need

A user states a durable project rule mid-conversation ("always X here", "never Y
again"). Without a capture mechanism it is lost at session end, or worse, written
silently into doctrine. This skill captures it into `.void/PROJECT-DOCTRINE.md`
under strict HITL (propose, wait, write, confirm), and routes universal rules to
`harness-evolution` instead. Without it, project memory is ad hoc and the
HITL-absolute principle has no operational home.

## Decision matrix anchor

- **Wins**: the user states a persistent project-specific rule/preference/constraint.
- **Loses to**: `harness-evolution` when the rule is universal (applies to all the
  user's projects) — that routes to a harness PR, not PROJECT-DOCTRINE.md.
- **Cannot decide**: whether a rule is correct (the user owns it); whether to apply
  it without confirmation (never — HITL).
- **Composes with**: `harness-evolution` (universal split), `compounding` (the
  end-of-cycle ritual that may route a learned pattern here), `claude-md-authoring`
  (governs the doc the rule lands in).

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| void-harness self-evolution principle | CLAUDE.md / docs/HARNESS_EVOLUTION.md | read | the HITL-absolute rule this skill operationalizes |
| superpowers learnings-capture pattern | (superpowers) | skimmed | kept the propose-then-write discipline, rejected auto-promotion |

## Adaptation strategy

**`original`** — harness-native. No external source ships a HITL project-rule
capture bound to `.void/PROJECT-DOCTRINE.md`; authored from the self-evolution
principle. See `.source`.

## Hard rules surfaced by this skill

- **Never auto-write into doctrine.** Enforced by: SKILL.md HITL gating (propose,
  wait for confirmation, then write). The non-negotiable rule of the whole harness.
- **Universal rules do not go to PROJECT-DOCTRINE.md.** Enforced by: the scope
  table that routes them to `harness-evolution`.

## Anti-rules (what this skill MUST NOT do)

- MUST NOT write to PROJECT-DOCTRINE.md without explicit user confirmation.
- MUST NOT capture a universal rule (routes to harness-evolution).
- MUST NOT edit PHILOSOPHY.md (managed by the harness).

## Verification checklist for shipping this skill

- [x] SKILL.md ≤ 400 LOC
- [x] Frontmatter `description` ≤ 200 chars
- [x] `.source` file present
- [x] Matrix row exists
- [x] Audit note present (this file)
- [ ] Sister-doc parity check (capture-rule is referenced from both CLAUDE.md and AGENTS.md)
