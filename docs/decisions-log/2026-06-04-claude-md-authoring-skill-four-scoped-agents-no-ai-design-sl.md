---
date: 2026-06-04
title: "claude-md-authoring skill, four scoped agents, no-ai-design-slop, doctrine edits"
---

## 2026-06-04: claude-md-authoring skill, four scoped agents, no-ai-design-slop, doctrine edits

Context: a deeper pass over the best-practice corpus surfaced gaps not covered by
the existing skills/agents.

Decision: add the `claude-md-authoring` skill (the harness produces CLAUDE.md
files; this governs writing them: length budget, no style rules -> linters,
`file:line` over snippets, progressive disclosure). Add four read-only,
model-tiered, narrow-scope agents — `silent-failure-hunter` (sonnet),
`type-design-analyzer` (opus), `code-explorer` (sonnet), `migration-planner`
(opus) — each routing out of scope, none overlapping doctrine-critic or gstack.
Add the `no-ai-design-slop` PreToolUse hook (deterministic regex for AI visual
tells; static gate, complements frontend-design without touching /design-review).
Distil doctrine into existing skills: vertical-slice planning (writing-plans),
frequent-intentional-compaction + leverage hierarchy (context-management,
code-review), and the agent model-tier convention (ARCHITECTURE.md).

Alternatives rejected:
- Stack-specific reviewer agents (per ECC/wshobson): those are pack concerns, not
  core; rejected to hold the anti-bloat line.
- Cryptographic review-surface receipts (wshobson governance): over-engineered;
  the HITL gate is the load-bearing part, not signed receipts.
