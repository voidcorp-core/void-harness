---
skill: harness-evolution
status: draft
strategy: original
target_loc: 350
phase: D
depends_on: []
composes_with: [code-review]
matrix_row: plans/skill-decision-matrix.md#harness-evolution
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `harness-evolution`

## Need

Without `harness-evolution`, the harness ossifies. Real friction discovered in consumer projects never makes it back to the harness; obsolete rules accumulate; the doctrine drifts from reality. citypaul evolves manually from his daily work; we systematize that loop with two modes (inbound feedback + outbound audit), HITL strict.

## Decision matrix anchor

Two modes: `feedback` (inbound suggestions from consumer projects) and `audit` (outbound obsolescence detection).

- **Wins (`feedback` mode)**: any moment, in any consumer project, when the model or user perceives a missing skill, missing rule, missing mention, or a hole in coverage. Captured to `.void/harness-feedback/proposed/`
- **Wins (`audit` mode)**: triggered by `npx @voidcorp/harness audit`. Reads usage logs, scans upstream sources for deprecation, surfaces matrix conflicts
- **Loses to**: nothing — it's a meta-skill, orthogonal
- **Cannot decide**: whether a proposed change is adopted (HITL only). Cannot write into harness doctrine — only opens issues/PRs
- **Composes with**: every skill (any skill can be the subject). Pairs naturally with `code-review`

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| citypaul self-evolution discipline | citypaul/.dotfiles (manual edits over time) | reviewed | inspiration; no existing automation precedent |
| Kieran Klaassen "compound engineering" | EveryInc plugin | reviewed | inspiration for the auto-capture pattern; adapted with HITL gate |
| Boris Cherny "how Boris uses Claude Code" | https://howborisusesclaudecode.com | reference | inspiration |

## Adaptation strategy

`original`. No existing precedent for this exact mechanism. Author from first principles, HITL strict.

## Hard rules (draft)

### Mode `feedback` (inbound)

- Trigger: model perceives gap during work in a consumer project ("the harness should have a `<X>` skill / rule / hook")
- Action: write a proposal to `.void/harness-feedback/proposed/YYYY-MM-DD-N.md` in the CONSUMER project (never in void-harness)
- Format: trigger context, observation, proposed change (skill / pack / hook / rule), target component, confidence (low/medium/high)
- Promotion: `npx @voidcorp/harness feedback push` walks each item with user (promote / discard / defer)
- Promoted items become issues or PRs on `voidcorp-core/void-harness` via `gh` — never direct writes

### Mode `audit` (outbound)

- Each skill invocation logs to `~/.void/usage.log` (local instrumentation, never shipped or telemetered)
- `npx @voidcorp/harness audit` reads the log, scans upstream sources, surfaces matrix conflicts
- Output: report (markdown) listing skills not invoked in N days, skills whose upstream was deprecated/superseded, matrix conflicts repeatedly fired
- Proposed actions (deprecate / fuse / rewrite) become PRs after human review
- N (the inactivity threshold) defaults to 30 days; configurable

### HITL is absolute

- No auto-write into harness doctrine ever
- Every change passes through human review and a normal commit
- The skill OPENS issues and PRs; it never merges them

## Modes

- `feedback`: inbound, captured during normal work
- `audit`: outbound, on-demand

## Companion hooks

- `usage-log-instrumentation` — every skill invocation emits a log line via a shared util (in `packages/core/claude/lib/usage-log.ts`, ≤ 30 LOC)
- `feedback-push-cli` — CLI command `npx @voidcorp/harness feedback push` (in `packages/cli/`)
- `audit-cli` — CLI command `npx @voidcorp/harness audit` (in `packages/cli/`)

## Composition

- Composes with `code-review`: a review that surfaces a missing rule may generate a feedback item
- Composes with all skills: any skill is a potential subject

## Anti-rules

- MUST NOT write directly to harness doctrine
- MUST NOT promote a feedback item without explicit user confirmation
- MUST NOT auto-merge any PR opened by the skill
- MUST NOT send usage data anywhere outside the user's machine (no telemetry, no analytics endpoint)

## Verification checklist — TBD

## Open questions

- N days inactivity threshold default — 30, 60, 90? Defer to first 6 months of usage data
- Privacy of `~/.void/usage.log` — confirm gitignored everywhere, document the log format
- Feedback PR template — link to spec / matrix / source project context
