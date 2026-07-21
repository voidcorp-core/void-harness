---
date: 2026-06-04
title: "Codex parity — real doctrine + safety floor, honest about what is pending"
---

## 2026-06-04: Codex parity — real doctrine + safety floor, honest about what is pending

Context: the doctrine layer (AGENTS.md) was a real mirror, but the mechanical
layer was Claude-only: `init` never emitted AGENTS.md, and the hooks were Claude
PreToolUse format. A consumer running `init` got a Claude-only harness.

Decision: (1) `init` now patches both CLAUDE.md and AGENTS.md from one runtime-aware
`harnessBlock` (Claude uses `@imports`, Codex lists files to read — Codex has no
`@import`). (2) `protect-sensitive-files` is runtime-aware: it reads
`.tool_input.file_path` (Claude) and scans `apply_patch` envelope headers (Codex),
unit-tested. (3) Ship `packages/core/codex/hooks.json` + `docs/CODEX.md` documenting
the opt-in Codex wiring; `block-dangerous-bash` matches Codex's `shell` tool 1:1.

Honest status logged in docs/CODEX.md: verified = sync gate, AGENTS.md emission,
hook payload parsing. Pending a real-Codex run = end-to-end `.codex/hooks.json`
firing, and a `RUNTIME=codex` (`codex exec`) backend for autonomous-backlog-loop.

Alternatives rejected:
- Auto-write `.codex/hooks.json` + copy hook scripts into every consumer now:
  duplicates the marketplace delivery model and the firing path is unverified
  without a real Codex run. Ship the template + doc; wire deliberately.
