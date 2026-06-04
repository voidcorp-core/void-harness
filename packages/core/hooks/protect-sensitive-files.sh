#!/usr/bin/env bash
# protect-sensitive-files — PreToolUse hook. Reads the agent's tool-call JSON
# from stdin. Blocks edits to files that should never be hand-edited by the
# agent: private keys, credential files, lockfiles, and anything under .git/.
# This is the safety floor for unattended / autonomous runs (blast-radius
# control), and works for both runtimes:
#   - Claude Code: Edit|Write -> .tool_input.file_path
#   - Codex:       apply_patch -> the patch envelope's "*** (Add|Update|Delete)
#                  File: <path>" headers (scanned from the raw payload)
#
# Override (a legitimate, deliberate edit): export VOID_HARNESS_ALLOW_SECRET_EDIT=1
# for the single run. The autonomous loops deliberately leave it unset.
#
# Exit codes: 0 allow, 2 block.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
FILE=$(printf "%s" "$INPUT" | jq -r '.tool_input.file_path // empty')

case "$TOOL" in Edit|Write|apply_patch|shell|Bash) ;; *) exit 0 ;; esac
[[ "${VOID_HARNESS_ALLOW_SECRET_EDIT:-}" == "1" ]] && exit 0

# Candidate target paths: the explicit file_path (Claude) plus any apply_patch
# headers (Codex). The patch text is JSON-encoded (newlines as literal \n), so
# decode the likely fields with jq first, then scan for the envelope headers.
PATCH=$(printf "%s" "$INPUT" \
  | jq -r '[.tool_input.content, .tool_input.command, .tool_input.input, .tool_input.patch] | map(select(. != null)) | .[]' 2>/dev/null || true)
CANDIDATES=$(
  { [[ -n "$FILE" ]] && printf "%s\n" "$FILE"
    printf "%s" "$PATCH" | grep -oE '^\*\*\* (Add|Update|Delete) File: .+' \
      | sed -E 's/^\*\*\* (Add|Update|Delete) File: //' || true
  } | sort -u
)
if [[ -z "$CANDIDATES" ]]; then exit 0; fi

reason_for() {
  local base; base=$(basename "$1")
  if [[ "$base" =~ ^\.env(\..+)?$ ]] && [[ ! "$base" =~ \.(example|sample|template|dist)$ ]]; then
    printf "environment file with secrets"; return; fi
  if [[ "$base" =~ \.(pem|key|p12|pfx|keystore|jks|asc)$ || "$base" =~ ^id_(rsa|ed25519|ecdsa|dsa)$ ]]; then
    printf "private key / certificate"; return; fi
  if [[ "$base" =~ (secret|credential|\.npmrc$|\.netrc$|\.pgpass$) ]]; then
    printf "credential file"; return; fi
  case "$base" in
    package-lock.json|pnpm-lock.yaml|yarn.lock|bun.lockb|Cargo.lock|poetry.lock|composer.lock)
      printf "lockfile (regenerate via the package manager, do not hand-edit)"; return ;;
  esac
  [[ "$1" =~ (^|/)\.git/ ]] && { printf "internal git metadata"; return; }
  return 0
}

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  REASON=$(reason_for "$path")
  if [[ -n "$REASON" ]]; then
    printf "protect-sensitive-files: refusing to edit %s\n" "$path" >&2
    printf "Reason: %s.\n" "$REASON" >&2
    printf "If this is a deliberate, reviewed edit: VOID_HARNESS_ALLOW_SECRET_EDIT=1.\n" >&2
    exit 2
  fi
done <<<"$CANDIDATES"

exit 0
