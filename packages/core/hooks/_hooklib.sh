#!/usr/bin/env bash
# _hooklib.sh — shared helpers for the PreToolUse Edit|Write enforcement hooks.
# SOURCED, never executed (leading underscore = library; excluded from the
# hook-size anti-bloat rule, see scripts/anti-bloat-check.sh). Goals (#63):
#   - parse the Claude Code stdin JSON exactly once per hook;
#   - never fail OPEN when jq is missing: scalar fields fall back to pure-bash
#     extraction, and content-scanning hooks fail CLOSED with one explicit
#     message rather than silently skipping enforcement (the audited bug: an
#     unguarded jq call exited 127 under `set -e`, which Claude treats as a
#     non-blocking error, so the whole hook layer went dark without jq);
#   - share the physical-path root normalization introduced for #62.
# Every symbol is prefixed hooklib_ / _hooklib_.

# hooklib_read: consume stdin once. Sets HOOK_INPUT and HOOK_JQ (1 iff jq usable).
hooklib_read() {
  HOOK_INPUT=$(cat)
  if command -v jq >/dev/null 2>&1; then HOOK_JQ=1; else HOOK_JQ=0; fi
}

# hooklib_str <jq-filter> <bash-key>: extract a JSON scalar string from
# HOOK_INPUT. jq when available; else a pure-bash regex on the (unescaped)
# "<bash-key>": "<value>" pair — exact for the flat scalar fields we read.
hooklib_str() {
  if [[ "${HOOK_JQ:-0}" == 1 ]]; then
    printf '%s' "$HOOK_INPUT" | jq -r "$1 // empty" 2>/dev/null || true
  else
    local re="\"$2\"[[:space:]]*:[[:space:]]*\"([^\"]*)\""
    [[ "$HOOK_INPUT" =~ $re ]] && printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
}

hooklib_tool() { hooklib_str '.tool_name' 'tool_name'; }
hooklib_file() { hooklib_str '.tool_input.file_path' 'file_path'; }

# hooklib_content: the edited text (.content for Write, .new_string for Edit).
# jq gives the exact, unescaped text. Returns 1 (prints nothing) when jq is
# absent — a pure-bash JSON string-unescape is not reliable enough to scan for
# forbidden patterns, so the caller must gate on hooklib_require_jq first.
hooklib_content() {
  [[ "${HOOK_JQ:-0}" == 1 ]] || return 1
  printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null || true
}

# hooklib_command: shell command (.command string, or Codex argv array joined).
hooklib_command() {
  if [[ "${HOOK_JQ:-0}" == 1 ]]; then
    printf '%s' "$HOOK_INPUT" \
      | jq -r 'if (.tool_input.command? | type) == "array" then (.tool_input.command | join(" ")) else (.tool_input.command // empty) end' 2>/dev/null || true
  else
    hooklib_str '.tool_input.command' 'command'
  fi
}

# hooklib_require_jq [name]: a content-scanning hook cannot verify an edit
# without jq. Rather than fail OPEN (the #63 bug), block once with an explicit,
# actionable message. jq is a documented prerequisite (void-harness doctor).
hooklib_require_jq() {
  [[ "${HOOK_JQ:-0}" == 1 ]] && return 0
  printf '%s: jq is required to inspect edit content but is not installed.\n' "${1:-hook}" >&2
  printf 'Blocking rather than silently skipping enforcement. Install jq\n' >&2
  printf '(e.g. brew install jq) or run: void-harness doctor.\n' >&2
  exit 2
}

# hooklib_root: the project root in physical form (CLAUDE_PROJECT_DIR, else the
# git toplevel, else pwd). Trailing slash stripped.
hooklib_root() {
  local r
  r=$(_hooklib_phys "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}")
  printf '%s' "${r%/}"
}

# hooklib_relpath <path>: strip the project-root prefix so root-anchored globs
# match the ABSOLUTE paths Claude Code passes (#62). Physical-path compare
# (logical/physical roots differ under symlinks, e.g. macOS /var -> /private/var).
hooklib_relpath() {
  local file="$1" root
  [[ "$file" == /* ]] || { printf '%s' "$file"; return 0; }
  root=$(hooklib_root)
  file=$(_hooklib_phys "$file")
  case "$file" in "$root"/*) file="${file#"$root"/}" ;; esac
  printf '%s' "$file"
}

# _hooklib_phys: resolve the longest existing directory prefix to its physical
# path, then re-append the trailing (possibly non-existent) components.
_hooklib_phys() {
  local p="$1" t=""
  while [[ ! -d "$p" && "$p" == */* ]]; do t="/${p##*/}$t"; p="${p%/*}"; done
  if [[ -d "$p" ]]; then printf '%s%s' "$(cd "$p" && pwd -P)" "$t"; else printf '%s' "$1"; fi
}
