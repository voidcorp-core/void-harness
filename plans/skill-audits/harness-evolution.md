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

- **Wins (`feedback` mode)**: any moment, in any consumer project, when the model or user perceives a missing skill, missing rule, missing mention, or a hole in coverage. Filed directly as a GitHub issue on `voidcorp-core/void-harness` once it clears the agnostic + harness-worthy bar (no per-project `proposed/` queue)
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
- Filing bar (load-bearing, since there is no `proposed/` pre-filter): file only when the gap is both *agnostic* (helps any consumer) and *harness-worthy* (changes a skill / hook / pack / CLI / doctrine line). Project-specific rules go to `.void/PROJECT-DOCTRINE.md` via `capture-rule`. Calibrate against the #34 ADR sweep (rejected all but one narrow correction)
- Action: draft a GitHub issue, confirm with the user, then `gh issue create --repo voidcorp-core/void-harness --label enhancement` with source-project context (repo, SHA, file path, motivation)
- Triage: the tracker is the triage zone — taking the issue promotes it, closing it declines it; no `proposed/`/`promoted/`/`discarded/` bookkeeping and no `feedback push` step
- Note (2026-06-26, issue #35): the original draft used a `.void/harness-feedback/proposed/` queue promoted by `void-harness feedback push`; that queue was a strictly worse reimplementation of the issue tracker and was dropped. See `docs/DECISIONS.md`

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
- inbound feedback: `gh issue create` directly against `voidcorp-core/void-harness` (no bespoke CLI; dropped in issue #35)
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
