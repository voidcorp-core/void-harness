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

## The hooks (a full mirror, not a floor)

The safety *floor* for an unattended run is the deny-by-default permission scope
(`.codex/hooks.json` allow/deny + a sandbox), not the blocklist hooks. The hooks
are enforcement on top. Codex's hook system mirrors Claude's: same event names
(`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`), same `hooks.json` schema
(events under a top-level `hooks` key), same "exit 2 blocks" convention, so the
void hook scripts run on Codex unchanged.

Codex used to receive only two guardrails where Claude received eighteen. It now
receives the **same enforcement surface**: the blocking greps (`no-any`,
`no-console-log`, `secret-in-content`, `boundary-direction-check`, `tdd-guard`,
…), plus `auto-format` on `PostToolUse`, `sessionstart-context`, and the
`stop-typecheck` gate on `Stop`.

### The one real difference: `apply_patch`

Claude edits **one file** per call (`Edit`/`Write`, carrying `file_path` +
`new_string`). Codex edits through **`apply_patch`, a multi-file diff**. Wiring
the content-scanning hooks without accounting for that would have fired them
against an empty payload — they would have passed everything while reading green.
A wired-but-dead hook is worse than an honest absence.

`_hooklib.sh` therefore exposes `hooklib_edits`: a runtime-agnostic stream of one
`<path, new-content>` record per edited file. Every content-scanning hook iterates
it. Two properties matter:

- only **added (`+`) lines** are collected, so removing or merely surrounding an
  offending line never trips a scan;
- **every file in the patch is scanned**, not just the first — a secret added in
  the second file of a multi-file patch is blocked and names the right file.

Without `jq` the stream degrades to the pure-bash `file_path`, so the path-only
hooks (`tdd-guard`, `auto-format`) keep enforcing as before; the content-scanning
hooks still fail **closed** via `hooklib_require_jq`.

### Wiring the Codex hooks (auto-wired by `init`)

`void-harness init` wires the hooks automatically whenever Codex is a selected
runtime (auto-detected from a `.codex/` dir or `AGENTS.md`, or forced with
`--runtime codex` / `--runtime both`). It:

1. Stages the hook scripts into `<project>/.void/hooks/` — every hook the
   manifest wires, plus the two sourced libraries `_hooklib.sh` + `_checks.sh`.
   The set is enumerated explicitly in `CODEX_FLOOR_SCRIPTS`, never globbed:
   this is a security surface, so growing it must be a deliberate act, and a
   drift-guard test asserts the set still covers every command the template
   references.
2. Compiles `<project>/.codex/hooks.json` from `packages/core/codex/hooks.json`,
   substituting `${VOID_HOOKS_DIR}` with a Git-root-resolved `.void/hooks` path
   (a relative path dies the moment a Codex session starts in a subdirectory).

The one remaining human step is to **trust the project-local `.codex/` layer**
per Codex's config. `void-harness doctor` verifies the floor: every hook the
manifest invokes must be a staged, executable script under `.void/hooks/`. After
a CLI upgrade, `void-harness update` re-stages the floor to the running CLI's
version (only on real drift), so a Codex project catches floor-script updates the
same way the Claude side catches marketplace bumps.

The former manual copy is no longer needed. `packages/core/codex/hooks.json`
remains the single source `init` compiles from; its `$comment` still documents
the manual path for anyone wiring `~/.codex/hooks.json` by hand.

## The agents (compiled, not re-authored)

Claude runs five read-only critics — `doctrine-critic`, `silent-failure-hunter`,
`type-design-analyzer`, `code-explorer`, `migration-planner` — as context-isolated
**subagents** shipped in the marketplace plugin. Codex has no stable equivalent to
spawn: its subagents are still experimental, and its custom prompts are deprecated
in favour of **skills**, which its own docs name as the reusable-capability
primitive.

So `init` **compiles** each agent definition into a Codex skill under
`.agents/skills/<name>/`, rather than hand-writing a second copy. One authored
doctrine per capability, rendered per runtime — which is what the runtime seam is
for. The Claude-only frontmatter keys (`tools`, `model`, `color`) are dropped
instead of carried as a promise Codex cannot honour, and each compiled file states
its own origin so nobody hand-edits a generated copy.

**Honest degradation**: Codex gets the capability, not the *context isolation*. A
skill runs inline in the main Codex context where Claude spawns a separate one.

## The commands

Claude gets `/void-graph`, `/void-doctor`, `/void-audit`, `/void-feedback` and
`/backlog-autopilot` as plugin commands. Nothing is missing on Codex:

- `backlog-autopilot` **is already a skill**, so it is staged like any other.
- The `void-*` commands are thin wrappers around the CLI, which is
  runtime-agnostic. Under Codex, invoke it directly: `void-harness doctor`,
  `void-harness audit`, `void-graph`. Codex custom prompts are not an option
  regardless — they are deprecated and live only in `~/.codex`, never in a repo.

## The irreducible residual

Everything above was closed by filling the gap. These cannot be, and saying so
plainly is the point — this is the only place where "prerequisite" keeps meaning:

| Not available on Codex | Why | Affects |
| --- | --- | --- |
| `Workflow` tool | Claude-Code-only orchestration primitive | `backlog-autopilot`'s parallel fan-out (the sequential path still works) |
| claude-in-chrome MCP | a Claude-bound browser extension | `qa`, `ui-review` live browser passes |
| `@voidcorp/make-pdf` | package not published | the `make-pdf` skill |
| `trim-large-output` hook | its `PostToolUse` output rewriting (`updatedToolOutput`) is unconfirmed on Codex, and a sibling field is documented as failing there | token-frugality trimming only; deliberately not wired rather than shipped dead |
| subagent context isolation | Codex subagents still experimental | the five compiled critics run inline |

## Status (verified vs pending)

- **Verified**: sister-doc gate; `init` emits `AGENTS.md` and auto-wires
  `.codex/hooks.json` (staged scripts + compiled manifest, unit-tested); `doctor`
  checks the wiring; the hooks parse both runtimes' payload shapes, including
  multi-file `apply_patch` (unit-tested); the five agents compile from the real
  `packages/core` tree (integration-tested); a real `init --runtime codex` stages
  19 scripts + 41 discoverable skills, and the staged hooks block a violation
  added in the second file of a multi-file patch.
- **Pending a real-Codex run**: end-to-end firing of `.codex/hooks.json` by Codex
  itself (the hooks are verified by direct invocation, not yet by a live Codex
  session), and a `RUNTIME=codex` backend for the backlog orchestrator (it
  currently invokes `claude -p`; `codex exec` is the intended swap). Tracked in
  `docs/DECISIONS.md` (2026-06-04, 2026-07-22) and the skill audit.
