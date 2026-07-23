# Codex parity

void-harness targets two runtimes from one doctrine. This page states honestly
what is parity-real today and what is opt-in or pending.

## One doctrine, per-runtime docs

`CLAUDE.md` (Claude Code) and `AGENTS.md` (Codex) carry identical doctrine,
terminology adapted (Skill tool ↔ tools, Claude ↔ Codex): `CLAUDE.md` uses
`@imports`, `AGENTS.md` uses explicit "read at session start" pointers (Codex has
no `@import`). In the **harness repo itself** the `scripts/sync-agent-docs.sh`
gate keeps both in lockstep (section-heading parity in CI + a both-or-neither
pre-commit check).

In a **consumer project** the doc is **per-runtime**: each runtime adapter writes
only its own doc. `void-harness init --runtime claude` emits just `CLAUDE.md`,
`--runtime codex` just `AGENTS.md`, `--runtime both` (the default when neither is
detected) emits both. A runtime added later with `void-harness runtime add
<runtime>` brings its doc with it. `doctor` only checks the doc of a *detected*
runtime, so a Codex-only project is never flagged for a missing `CLAUDE.md`.

## The skills

Skill content is runtime-agnostic prose and applies to both. Claude Code
auto-discovers the harness plugin's skills from the marketplace. Codex discovers
skills two ways: by **directory convention** — scanning `.agents/skills` from the
cwd up to the repo root — and, more recently, through a **native plugin channel**
(`.codex-plugin/plugin.json` + `codex plugin marketplace add owner/repo`, bundling
skills and hooks). See the official docs: [build-skills] and [build-plugins].

We use the **directory-convention** path: `init` **materializes** the skills
into `.agents/skills`. Every skill that declares `codex` in its `runtimes`
frontmatter is staged as `.agents/skills/<name>/` — the whole skill folder
(SKILL.md + scripts/references), core **and** the skills of every activated pack
(the pack skills ship bundled in the CLI tarball). A Codex user thus gets both the
doctrine (via `AGENTS.md` + `.void/`) **and** the invocable skills. `doctor`
reports how many are discoverable; `update` re-stages them to the running CLI's
version. This is chosen because it is universal, reproducible, and account-free
(no marketplace fetch); the native Codex plugin channel is a viable
**complementary** channel we may add later (tracked as an issue) so both runtimes
resolve the same artifacts from a plugin.

[build-skills]: https://learn.chatgpt.com/docs/build-skills
[build-plugins]: https://learn.chatgpt.com/docs/build-plugins

### Usage measurement (a Codex platform limit)

`status`/`void-graph` count skill **usage** from observable invocations — on
Claude, a skill runs through the `Skill` tool, which the activation-meter hook
records. Codex loads skills as context and fires **no hook event** for them (its
hooks cover `Bash`, `apply_patch`, MCP and other function tools, not skill use).
So on a Codex-only project the usage counts reflect Claude usage only — a low
count means "not observed", not "not useful". This is a Codex limitation, not a
gap in the harness; nothing to instrument until Codex surfaces skill use.

## The hooks (guardrails, not the floor)

The safety *floor* for an unattended run is the deny-by-default permission scope
(`.codex/hooks.json` allow/deny + a sandbox), not the blocklist hooks. The hooks
are guardrails on top. Codex's hook system mirrors Claude's: same event names
(`PreToolUse`, …), same `hooks.json` schema, same "exit 2 blocks" convention, so
the void hook scripts run on Codex unchanged:

- `block-dangerous-bash.sh` is a **best-effort** blocklist of common footguns
  (recursive root/home deletes, force-push, raw-device writes, destructive SQL).
  It reads Codex's `shell` command as a string or an argv array. It will miss
  novel forms — treat it as a tripwire, not a boundary.
- `protect-sensitive-files.sh` is a deny-list of never-edit files. It reads
  `.tool_input.file_path` (Claude `Edit`/`Write`) **and** scans `apply_patch`
  envelope headers (`*** Update File: <path>`), handling Codex's string or
  argv-array command shape, case-insensitively. Covered by tests.

### Wiring the Codex floor (auto-wired by `init`)

`void-harness init` wires the Codex floor automatically whenever Codex is a
selected runtime (auto-detected from a `.codex/` dir or `AGENTS.md`, or forced
with `--runtime codex` / `--runtime both`). It:

1. Stages the floor's hook scripts into `<project>/.void/hooks/`
   (`block-dangerous-bash.sh`, `protect-sensitive-files.sh`, and the two sourced
   libraries `_hooklib.sh` + `_checks.sh`).
2. Compiles `<project>/.codex/hooks.json` from `packages/core/codex/hooks.json`,
   substituting `${VOID_HOOKS_DIR}` with the project-relative `.void/hooks`
   (committable, portable — assumes Codex runs hooks with cwd at the project
   root, mirroring Claude Code).

The one remaining human step is to **trust the project-local `.codex/` layer**
per Codex's config. `void-harness doctor` verifies the floor: every hook the
manifest invokes must be a staged, executable script under `.void/hooks/`. After
a CLI upgrade, `void-harness update` re-stages the floor to the running CLI's
version (only on real drift), so a Codex project catches floor-script updates the
same way the Claude side catches marketplace bumps.

The former manual copy is no longer needed. `packages/core/codex/hooks.json`
remains the single source `init` compiles from; its `$comment` still documents
the manual path for anyone wiring `~/.codex/hooks.json` by hand.

## Status (verified vs pending)

- **Verified**: sister-doc gate, `init` emits `AGENTS.md` **and auto-wires the
  `.codex/hooks.json` floor** (staged scripts + compiled manifest, unit-tested),
  `doctor` checks the floor, the two security hooks parse the Codex payload
  shapes (unit-tested).
- **Pending a real-Codex run**: end-to-end firing of `.codex/hooks.json`
  (including confirming the project-relative hook-path resolution), and a
  `RUNTIME=codex` backend for `autonomous-backlog-loop` (the orchestrator
  currently invokes `claude -p`; `codex exec` is the intended swap). Tracked in
  `docs/DECISIONS.md` (2026-06-04, 2026-07-22) and the skill audit.
