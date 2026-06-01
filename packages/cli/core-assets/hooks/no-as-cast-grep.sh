#!/usr/bin/env bash
# no-as-cast-grep — PreToolUse hook. Reads Claude Code JSON from stdin.
# Blocks `as Foo` and `as unknown as Foo` casts in business TS.
# Allowed: `as const`, `as readonly` (idiomatic, not casts).
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

# `as <Identifier>` excluding const/readonly. Use grep -P for negative lookahead.
re_cast='\bas[[:space:]]+(?!const\b|readonly\b)[A-Z][A-Za-z0-9_]*'

HITS=$(printf "%s" "$NEW" | grep -nP "$re_cast" 2>/dev/null | grep -vE '// *allow-as-cast:' || true)

if [[ -n "$HITS" ]]; then
  printf "no-as-cast-grep: 'as <Type>' cast detected in %s\n%s\n\n" "$FILE" "$HITS" >&2
  printf "Prefer: type guards, generics, narrowing, or Zod parse at the boundary.\n" >&2
  printf "'as const' / 'as readonly' are allowed (literal narrowing, not casts).\n" >&2
  printf "Override (rare): tag the line '// allow-as-cast: <reason>'.\n" >&2
  exit 2
fi

exit 0
