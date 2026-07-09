#!/usr/bin/env bash
# protect-sensitive-files — PreToolUse hook. Reads the agent's tool-call JSON
# from stdin. Blocks edits to files that should never be hand-edited by the
# agent: private keys, credential files, lockfiles, and anything under .git/.
# This is a deny-list guardrail (an enumerable set of never-edit files), not the
# whole safety boundary: the deny-by-default floor for unattended runs is the
# scoped allowlist + sandbox (settings.autonomous.json, docs/CODEX.md). It works
# for both runtimes:
#   - Claude Code: Edit|Write -> .tool_input.file_path
#   - Codex:       apply_patch -> the patch envelope's "*** (Add|Update|Delete)
#                  File: <path>" headers (scanned from the raw payload)
#
# Override (a legitimate, deliberate edit): export VOID_HARNESS_ALLOW_SECRET_EDIT=1
# for the single run. The autonomous loops deliberately leave it unset.
#
# Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"
source "${BASH_SOURCE[0]%/*}/_checks.sh"

hooklib_read
TOOL=$(hooklib_tool)
FILE=$(hooklib_file)

case "$TOOL" in Edit|Write|apply_patch|shell|Bash) ;; *) exit 0 ;; esac
[[ "${VOID_HARNESS_ALLOW_SECRET_EDIT:-}" == "1" ]] && exit 0

# Candidate target paths: the explicit file_path (Claude, via the pure-bash
# fallback even without jq) plus any apply_patch headers (Codex). The patch
# text is JSON-encoded (newlines as literal \n), decoded with jq; when jq is
# absent this Codex path degrades to empty while the Claude file_path check
# still enforces (strictly better than the previous total fail-open on 127).
if [[ "${HOOK_JQ:-0}" == 1 ]]; then
  PATCH=$(printf "%s" "$HOOK_INPUT" \
    | jq -r '[.tool_input.content, .tool_input.command, .tool_input.input, .tool_input.patch] | map(select(. != null)) | map(if type == "array" then join("\n") else . end) | .[]' 2>/dev/null || true)
else
  PATCH=""
fi
CANDIDATES=$(
  { [[ -n "$FILE" ]] && printf "%s\n" "$FILE"
    printf "%s" "$PATCH" | grep -oE '^\*\*\* (Add|Update|Delete) File: .+' \
      | sed -E 's/^\*\*\* (Add|Update|Delete) File: //' || true
  } | sort -u
)
if [[ -z "$CANDIDATES" ]]; then exit 0; fi

# Detection lives in _checks.sh (checks_sensitive_path), shared verbatim with the
# CI diff driver so the local and server-side floors can never diverge (DEV-393).
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  REASON=$(checks_sensitive_path "$path") && continue
  printf "protect-sensitive-files: refusing to edit %s\n" "$path" >&2
  printf "Reason: %s.\n" "$REASON" >&2
  printf "If this is a deliberate, reviewed edit: VOID_HARNESS_ALLOW_SECRET_EDIT=1.\n" >&2
  exit 2
done <<<"$CANDIDATES"

exit 0
