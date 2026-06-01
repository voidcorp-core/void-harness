#!/usr/bin/env bash
# no-console-log-grep — PreToolUse hook. Reads Claude Code JSON from stdin.
# Blocks edits introducing console.{log,error,warn,info,debug} in business code.
# Use the project logger (@repo/core/logger via pino) instead. See void:observability.
# Exit codes: 0 allow, 2 block.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
FILE=$(printf "%s" "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW=$(printf "%s" "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" || -z "$NEW" ]] && exit 0
[[ "$FILE" =~ \.(ts|tsx|js|jsx)$ ]] || exit 0

# Skip scripts (one-shot tools may legitimately log), tests, fixtures, generated
[[ "$FILE" =~ ^scripts/|/scripts/|\.(test|spec)\.|/__fixtures__/|/__generated__/ ]] && exit 0

re_console='\bconsole\.(log|error|warn|info|debug)\b'

HITS=$(printf "%s" "$NEW" | grep -nE "$re_console" | grep -vE '// *allow-console:' || true)

if [[ -n "$HITS" ]]; then
  printf "no-console-log-grep: console.* in %s\n%s\n\n" "$FILE" "$HITS" >&2
  printf "Use @repo/core/logger (pino) instead. See the void:observability skill.\n" >&2
  printf "Override (rare): tag the line '// allow-console: <reason>'.\n" >&2
  exit 2
fi

exit 0
