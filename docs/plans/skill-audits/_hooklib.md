# Audit note — `packages/core/hooks/_hooklib.sh` (#63)

Not a distilled external source: this is a first-party shared library extracted
from the duplicated preamble of the wired PreToolUse hooks. Recorded here so the
migration decisions travel with the repo.

## Why

The 14 wired hooks each re-parsed stdin with 3-4 **unguarded** `jq` calls under
`set -euo pipefail`. With `jq` absent, the first call exits 127; Claude Code
treats a non-0/2 exit as a non-blocking error, so every hook went dark while
appearing active — a silent fail-open of the whole enforcement floor. `_hooklib.sh`
centralizes one guarded parse and, for content-scanning hooks, **fails closed**.

## What the library owns

- `hooklib_read` — consume stdin once; set `HOOK_INPUT`, `HOOK_JQ`.
- `hooklib_tool` / `hooklib_file` / `hooklib_str` — scalar fields with a pure-bash
  fallback (exact for the flat unescaped scalars we read).
- `hooklib_content` — the edited text via jq; returns non-zero without jq.
- `hooklib_require_jq` — blocks (exit 2) with one explicit message when jq is
  absent, so a content hook never scans nothing and passes.
- `hooklib_command` — `.command` string or Codex argv array joined.
- `hooklib_root` / `hooklib_relpath` — physical root-relative normalization (#62).

## Migration decisions

**Routed through the lib (12):** tdd-guard, no-any-grep, no-as-cast-grep,
no-console-log-grep, no-null-grep, no-only-no-skip, boundary-direction-check,
test-name-lint, no-ai-design-slop, protect-sensitive-files, block-dangerous-bash,
auto-format.

**Deliberately NOT routed (2), documented rather than force-fitted:**

- `activation-meter.sh` — already carries its own jq + pure-bash fallback and is
  the reference the lib was modeled on; it is non-blocking (a universal meter) and
  builds a bespoke JSON event that the generic helpers do not cover. Re-plumbing it
  for the shared `hooklib_read` alone would add risk for no correctness gain.
- `sessionstart-context.sh` — a SessionStart hook, not a tool-call parser: it has
  no `tool_name`/`file_path` to extract and only emits `additionalContext`.

## Degraded-mode behavior without jq

- Content-scanning hooks: **fail closed** (block with an explicit install-jq message).
- tdd-guard: still enforces via the pure-bash scalar path; config falls back to
  defaults instead of erroring.
- protect-sensitive-files: the Claude `file_path` deny-list still enforces; only the
  Codex apply_patch header scan degrades to empty — strictly better than the prior
  total fail-open.
- block-dangerous-bash: string commands still screened; only the Codex argv-array
  join degrades.
- auto-format: non-blocking by design; no-op without jq is acceptable.

## Guardrails

- `_`-prefix marks a sourced library, exempt from the 100-LOC hook cap
  (`scripts/anti-bloat-check.sh`, rule 5) but still `bash -n` syntax-checked.
- New anti-bloat gate: every `hooks/<name>.sh` wired in `plugin.json` must exist on
  disk (manifest ↔ disk), closing another fail-open avenue.
- Convention recorded in `docs/ARCHITECTURE.md` and CLAUDE.md/AGENTS.md rule 5.
