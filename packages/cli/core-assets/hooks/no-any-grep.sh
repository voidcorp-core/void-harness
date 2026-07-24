#!/usr/bin/env bash
# no-any-grep — PreToolUse hook. Reads the runtime's tool-call JSON from stdin.
# https://code.claude.com/docs/en/hooks
#
# Blocks edits introducing `: any` or `<any>` in business TS code.
# Composes with the harness:typescript-strict skill.
#
# Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

hooklib_read
TOOL=$(hooklib_tool)

# Claude edits one file at a time (Edit|Write); Codex applies a multi-file diff
# (apply_patch). hooklib_edits normalizes both into one record per edited file,
# so this hook enforces identically on either runtime instead of reading an
# empty payload under Codex (a wired-but-dead hook = a silent enforcement hole).
case "$TOOL" in Edit|Write|apply_patch) ;; *) exit 0 ;; esac
hooklib_require_jq no-any-grep

# Match `: any`, `<any>`, or `as any`
re_any=':[[:space:]]*any\b|<any>|\bas[[:space:]]+any\b'

while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  FILE="${REC%%"$_HOOKLIB_US"*}"
  NEW="${REC#*"$_HOOKLIB_US"}"
  [[ -z "$FILE" || -z "$NEW" ]] && continue
  [[ "$FILE" =~ \.(ts|tsx)$ ]] || continue
  [[ "$FILE" =~ \.(test|spec)\.(ts|tsx)$|\.d\.ts$|/__generated__/ ]] && continue

  HITS=$(printf "%s" "$NEW" | grep -nE "$re_any" | grep -vE '// *allow-any:' || true)

  if [[ -n "$HITS" ]]; then
    printf "no-any-grep: 'any' detected in %s\n%s\n\n" "$FILE" "$HITS" >&2
    printf "Use a precise type, unknown + narrow, or generic. See harness:typescript-strict.\n" >&2
    printf "Override (rare, documented): tag the line '// allow-any: <reason>'.\n" >&2
    exit 2
  fi
done < <(hooklib_edits)

exit 0
