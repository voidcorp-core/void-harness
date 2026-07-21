---
date: 2026-06-19
title: "implement the promised `audit` + `feedback push` CLI commands (issue #17 cluster C)"
---

## 2026-06-19: implement the promised `audit` + `feedback push` CLI commands (issue #17 cluster C)

Context: `harness-evolution`'s SKILL.md and PHILOSOPHY.md presented
`void-harness audit` and `void-harness feedback push` as if they existed, and
two shipped slash-commands depended on them — `/void-audit` literally runs
`void-harness audit`, and `/void-feedback` defers promotion to
`void-harness feedback push`. Neither CLI command existed, so `/void-audit` was
broken on invocation and the inbound→issue loop had no automation. (Issue #17
cluster C / C1.)

Decision: implement both, rather than rewrite the skills to a manual gesture.
- `void-harness audit` (MVP, usage-log only): reads `.void/usage.log` (written by
  the `skill-usage-meter` hook, `<timestamp>\t<skill>` per line) and classifies
  each harness skill as active / stale (`--stale-days`, default 30) / never. The
  stale + never lists are the deprecation candidates. Report-only (HITL).
- `void-harness feedback push`: reads `.void/harness-feedback/proposed/*.md`,
  previews by default (no side effects), and with `--open` files each note as a
  GitHub issue on `voidcorp-core/void-harness` (label `harness-feedback`) and
  moves it to `pushed/`. Preview-by-default keeps promotion deliberate.

Why implement, not doc-fix: the skills already wrap these commands by design
(the skill is the interactive HITL surface; the CLI is the deterministic,
testable engine). Implementing makes the skills work and the docs true; a
doc-fix would have left `/void-audit` a no-op.

Scope held to the usage-log MVP for `audit`: upstream-source deprecation and
decision-matrix-conflict detection need data sources beyond the usage log and
are a documented follow-up — not built here. The pure cores
(`lib/audit.ts`, `lib/feedback.ts`) are unit-tested; the commands are thin
readers/renderers over them.

Alternative considered: a fictional `audit propose-pr <item>` helper (referenced
in an old SKILL line) — dropped. `audit` reports; deprecation PRs stay
hand-authored, consistent with "HITL is absolute, never auto-write doctrine."
