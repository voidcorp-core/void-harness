---
date: 2026-06-04
title: "lifecycle hooks beyond PreToolUse + plugin slash commands"
---

## 2026-06-04: lifecycle hooks beyond PreToolUse + plugin slash commands

Context: the plugin wired only PreToolUse hooks and shipped zero slash commands,
leaving the rest of the lifecycle (and in-session ergonomics) unused.

Decision: add `auto-format` (PostToolUse, non-blocking Biome format — repairs
instead of refusing, fails open if Biome absent), `precompact-doctrine`
(PreCompact — re-injects the non-negotiable floor before context loss),
`sessionstart-context` (SessionStart — per-session floor reminder + version), and
`skill-usage-meter` (PreToolUse on Skill — appends to `.void/usage.log` so the
outbound `audit` has real data). Ship `/void-feedback`, `/void-doctor`,
`/void-audit` slash commands so the self-evolution loop is invocable in-session.

Alternatives rejected:
- A UserPromptSubmit hook: overlaps skill auto-discovery and risks noise.
- Making auto-format blocking: formatting must never block a turn; PostToolUse
  non-blocking is the right shape.
