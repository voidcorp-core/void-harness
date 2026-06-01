#!/usr/bin/env bash
# no-null-grep — PreToolUse hook. Reads Claude Code JSON from stdin.
# Blocks edits introducing `null` in business code. Prefer `undefined` or
# Option<T>. Composes with void:functional and void:typescript-strict.
# Exit codes: 0 allow, 2 block.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
FILE=$(printf "%s" "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW=$(printf "%s" "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" || -z "$NEW" ]] && exit 0
[[ "$FILE" =~ \.(ts|tsx)$ ]] || exit 0
[[ "$FILE" =~ \.(test|spec)\.(ts|tsx)$|\.d\.ts$|/__generated__/ ]] && exit 0

# Match `null` as identifier
re_null='\bnull\b'

HITS=$(printf "%s" "$NEW" | grep -nE "$re_null" | grep -vE '// *allow-null:' || true)

if [[ -n "$HITS" ]]; then
  # Filter false positives at library boundaries
  if printf "%s" "$NEW" | grep -qE 'from .drizzle-orm|JSON\.(stringify|parse)|typeof.*=== .null'; then
    exit 0
  fi
  printf "no-null-grep: 'null' literal in %s\n%s\n\n" "$FILE" "$HITS" >&2
  printf "Prefer undefined or Option<T>. See void:functional.\n" >&2
  printf "Override (library boundary): tag the line '// allow-null: <reason>'.\n" >&2
  exit 2
fi

exit 0
