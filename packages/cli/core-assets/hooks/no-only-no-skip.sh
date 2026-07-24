#!/usr/bin/env bash
# no-only-no-skip — PreToolUse hook. Reads the runtime's JSON from stdin.
# Blocks edits introducing it.only / describe.only / it.skip / xit / xdescribe
# in test files. These accidentally ship and silently disable test coverage.
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
hooklib_require_jq no-only-no-skip

re_focus='\b(it|test|describe)\.only\b|\b(it|test)\.skip\b|\bxit\b|\bxdescribe\b'

while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  FILE="${REC%%"$_HOOKLIB_US"*}"
  NEW="${REC#*"$_HOOKLIB_US"}"
  [[ -z "$FILE" || -z "$NEW" ]] && continue
  [[ "$FILE" =~ \.(test|spec)\.(ts|tsx|js|jsx)$ ]] || continue

  HITS=$(printf "%s" "$NEW" | grep -nE "$re_focus" || true)

  if [[ -n "$HITS" ]]; then
    printf "no-only-no-skip: focused/skipped test in %s\n%s\n\n" "$FILE" "$HITS" >&2
    printf "These accidentally land in main and silently drop coverage.\n" >&2
    printf "Use it.todo for known-pending tests; .only is debugging-only, never commit.\n" >&2
    exit 2
  fi
done < <(hooklib_edits)

exit 0
