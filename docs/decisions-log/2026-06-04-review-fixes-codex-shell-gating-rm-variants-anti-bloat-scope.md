---
date: 2026-06-04
title: "review fixes — Codex shell gating, rm variants, anti-bloat scope, agent .source"
---

## 2026-06-04: review fixes — Codex shell gating, rm variants, anti-bloat scope, agent .source

Context: a self-review found real defects in the round-2 work.

Decisions:
- **block-dangerous-bash** now gates Codex's `shell` tool (was `Bash`-only, so the
  Codex hooks.json routing was inert) and reads an argv-array command. Its rm
  detection was rewritten to a (recursive-flag AND catastrophic-target) pair on a
  quote-stripped command, covering `rm -rf -- /`, `rm -rf "$HOME"`, `${HOME}`,
  `.`, `./`, `./*`, `*`, `~`/`~/` — while still allowing `./dist`, `build/*`,
  `~/.cache/x`, `/tmp/x`. Tests added for each.
- **anti-bloat-check** now scans pack skills/hooks too (was core-only), matching
  what ARCHITECTURE.md already claimed ("any SKILL.md / any hooks/*.sh"). This
  immediately caught 8 pack skill descriptions over the 200-char cap; trimmed.
- **Sourcing discipline applies to agents, not just skills.** doctrine-critic
  already carried a `.source`; the four new agents now do too. The CLAUDE.md
  sourcing rule is read as covering any authored doctrine artifact (skill or
  agent), since both are distilled from external sources.
- Refreshed the marketplace manifest (`.claude-plugin/marketplace.json`): the
  `harness` plugin now lists the five agents + lifecycle hooks; harness-monorepo drops
  the "ADR workflow" line (adr-workflow was promoted to core).

Alternatives rejected:
- A full shell-AST parse for rm safety: too heavy for a <100-line hook. The
  quote-strip + anchored-target regex covers the catastrophic forms deterministically;
  the override env var handles the rare legitimate case.
