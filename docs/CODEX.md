# Codex parity

void-harness targets two runtimes from one doctrine. This page states honestly
what is parity-real today and what is opt-in or pending.

## One doctrine, two docs

`CLAUDE.md` (Claude Code) and `AGENTS.md` (Codex) are sister docs: identical
doctrine, terminology adapted (Skill tool ↔ tools, Claude ↔ Codex). The
`scripts/sync-agent-docs.sh` gate enforces this — section-heading parity in CI,
and a both-or-neither pre-commit check (`.githooks/pre-commit`). `void-harness
init` now writes **both** files into a consumer project: `CLAUDE.md` with
`@imports`, `AGENTS.md` with explicit "read at session start" pointers (Codex has
no `@import`).

## The skills

Skill content is runtime-agnostic prose and applies to both. Claude Code
auto-discovers the void plugin's skills from the marketplace; a Codex user reads
the same doctrine via `AGENTS.md` + the `.void/` files.

## The hooks (safety floor)

Codex's hook system mirrors Claude's: same event names (`PreToolUse`, …), same
`hooks.json` schema, same "exit 2 blocks" convention. So the void hook scripts
run on Codex unchanged, with two notes:

- `block-dangerous-bash.sh` matches Codex's `shell` tool 1:1 (it reads
  `.tool_input.command`). Zero changes.
- `protect-sensitive-files.sh` is runtime-aware: it reads `.tool_input.file_path`
  (Claude `Edit`/`Write`) **and** scans the `apply_patch` envelope headers
  (`*** Update File: <path>`) that Codex produces. Covered by tests.

### Wiring the Codex floor (opt-in)

1. Copy `packages/core/codex/hooks.json` to `<project>/.codex/hooks.json`
   (or `~/.codex/hooks.json`).
2. Make the hook scripts resolvable and point `${VOID_HOOKS_DIR}` at their
   directory (an absolute path to `packages/core/hooks`, or a copied
   `.void/hooks/`).
3. Trust the project-local `.codex/` layer per Codex's config.

## Status (verified vs pending)

- **Verified**: sister-doc gate, `init` emits `AGENTS.md`, the two security hooks
  parse the Codex payload shapes (unit-tested).
- **Pending a real-Codex run**: end-to-end firing of `.codex/hooks.json`, and a
  `RUNTIME=codex` backend for `autonomous-backlog-loop` (the orchestrator
  currently invokes `claude -p`; `codex exec` is the intended swap). Tracked in
  `docs/DECISIONS.md` (2026-06-04) and the skill audit.
