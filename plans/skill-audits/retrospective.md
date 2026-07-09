---
skill: retrospective
status: shipped
strategy: distill (signal methodology only) + dedicated skill
target_loc: 400
actual_loc: 72
activation: on-demand
phase: D
depends_on: []
composes_with: [learning-capture, systematic-debugging, writing-plans]
source_ticket: DEV-396
epic: DEV-383
audit_date: 2026-07-10
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `retrospective`

## Need

The gstack teardown removes `/retro` (weekly engineering retrospective). Its durable value is the git-history signal methodology — reading a window of commits/PRs to surface hotspots, a slipping test ratio, a fix-heavy cycle, recurring-fix files — and turning that into improvement decisions. That methodology must survive; the gstack state-file plumbing and the gamification must not.

## Decision: light dedicated skill, not a fold (spun out of DEV-386)

DEV-386 originally mapped retro → `compounding`. On execution two facts killed that: (1) `compounding` no longer exists (fused into `learning-capture`, issue #75); (2) a periodic *window* review is a distinct subject from `learning-capture`'s *point* capture of one lesson — folding would violate one-skill-one-subject and overflow the 400-line cap. Decision (Folpe, logged in the DEV-386 DECISIONS entry): a **light dedicated `harness:retrospective`** that FEEDS `learning-capture`. `activation: on-demand` (invoked on a cadence, not passive doctrine).

## Kept (the signal methodology)

Window gathering from git log (commits, authors, files, conventional-commit types, insertions/deletions), PRs (via `gh`), and `.void/usage.log`/`activations.jsonl`. Signals: commit-type mix, hotspots, recurring-fix files, test-to-prod ratio, PR-size distribution, regressions. Output ends in concrete improvement decisions, with durable patterns routed to `learning-capture` (HITL).

## Rejected (documented)

- **The gamification**: focus score, ship-of-the-week, personal/team streaks, the week-over-week leaderboard. Quantified-self productivity theatre — it optimizes a number, not the code. This is the explicit de-scope the ticket asked for.
- **gstack data dependency**: the original reads `~/.gstack/`, `timeline.jsonl`, gstack analytics — all disappearing at teardown. The harness version reads git log / PRs / `.void/` only (AC: no `~/.gstack/` dependency, grep-green).
- **All gstack runtime** (preamble, gbrain, telemetry, voice, plan-mode, history-save-to-gstack-paths).

## Overlap management

< 30% with `learning-capture`: the retro is a discovery pass over a window that produces decisions and routes patterns; learning-capture is the point-capture that writes one lesson to doctrine (HITL). The retro writes nothing into doctrine itself. Composes with `systematic-debugging` (recurring-fix file = architectural smell at window scale) and `writing-plans` (large-PR window = slicing signal) as pointers, not restated content.

## Verification

Anti-bloat (72 LOC ≤ 400, desc 199 ≤ 200, name==folder, `.source` + this note), core-assets mirror, graph regen, full test suite, CLAUDE.md↔AGENTS.md parity. Behavioral eval deferred to DEV-397 (a retro report is a conversational artifact the v1 eval harness cannot score).
