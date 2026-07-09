#!/usr/bin/env bash
# no-only-no-skip — PreToolUse hook. Reads Claude Code JSON from stdin.
# Blocks edits introducing it.only / describe.only / it.skip / xit / xdescribe
# in test files. These accidentally ship and silently disable test coverage.
# Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

hooklib_read
TOOL=$(hooklib_tool)
FILE=$(hooklib_file)

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" ]] && exit 0
[[ "$FILE" =~ \.(test|spec)\.(ts|tsx|js|jsx)$ ]] || exit 0
hooklib_require_jq no-only-no-skip
NEW=$(hooklib_content)
[[ -z "$NEW" ]] && exit 0

re_focus='\b(it|test|describe)\.only\b|\b(it|test)\.skip\b|\bxit\b|\bxdescribe\b'

HITS=$(printf "%s" "$NEW" | grep -nE "$re_focus" || true)

if [[ -n "$HITS" ]]; then
  printf "no-only-no-skip: focused/skipped test in %s\n%s\n\n" "$FILE" "$HITS" >&2
  printf "These accidentally land in main and silently drop coverage.\n" >&2
  printf "Use it.todo for known-pending tests; .only is debugging-only, never commit.\n" >&2
  exit 2
fi

exit 0
