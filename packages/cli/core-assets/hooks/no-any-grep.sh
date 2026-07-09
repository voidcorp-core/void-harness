#!/usr/bin/env bash
# no-any-grep — PreToolUse hook. Reads Claude Code JSON from stdin.
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
FILE=$(hooklib_file)

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" ]] && exit 0
[[ "$FILE" =~ \.(ts|tsx)$ ]] || exit 0
[[ "$FILE" =~ \.(test|spec)\.(ts|tsx)$|\.d\.ts$|/__generated__/ ]] && exit 0
hooklib_require_jq no-any-grep
NEW=$(hooklib_content)
[[ -z "$NEW" ]] && exit 0

# Match `: any`, `<any>`, or `as any`
re_any=':[[:space:]]*any\b|<any>|\bas[[:space:]]+any\b'

HITS=$(printf "%s" "$NEW" | grep -nE "$re_any" | grep -vE '// *allow-any:' || true)

if [[ -n "$HITS" ]]; then
  printf "no-any-grep: 'any' detected in %s\n%s\n\n" "$FILE" "$HITS" >&2
  printf "Use a precise type, unknown + narrow, or generic. See harness:typescript-strict.\n" >&2
  printf "Override (rare, documented): tag the line '// allow-any: <reason>'.\n" >&2
  exit 2
fi

exit 0
