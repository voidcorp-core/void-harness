#!/usr/bin/env bash
# no-null-grep — PreToolUse hook. Reads Claude Code JSON from stdin.
# Blocks edits introducing `null` in business code. Prefer `undefined` or
# Option<T>. Composes with harness:functional and harness:typescript-strict.
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

# Filter false positives at library boundaries (whole-content escape hatch).
if printf "%s" "$NEW" | grep -qE 'from .drizzle-orm|JSON\.(stringify|parse)|typeof.*=== .null'; then
  exit 0
fi

# Match `null` per line on a comment- and string-stripped view, so the literal
# substring `null` inside a `//` comment, a `/* */` block, or a quoted string
# is not flagged. This is a line-oriented heuristic, not an AST: a `null` inside
# a multi-line block comment or template literal split across the edit chunk may
# still be reported — tag such a line with `// allow-null:` to override.
# The override is checked on the RAW line (stripping would erase the tag).
HITS=""
lineno=0
while IFS= read -r line || [[ -n "$line" ]]; do
  lineno=$((lineno + 1))
  printf "%s" "$line" | grep -qE '// *allow-null:' && continue
  code=$(printf "%s" "$line" | sed -E \
    -e 's@"([^"\\]|\\.)*"@@g' \
    -e "s@'([^'\\\\]|\\\\.)*'@@g" \
    -e 's@`[^`]*`@@g' \
    -e 's@/\*.*\*/@@g' \
    -e 's@//.*@@')
  if printf "%s" "$code" | grep -qE "$re_null"; then
    HITS+="${lineno}:${line}"$'\n'
  fi
done < <(printf "%s" "$NEW")

if [[ -n "$HITS" ]]; then
  printf "no-null-grep: 'null' literal in %s\n%s\n" "$FILE" "$HITS" >&2
  printf "Prefer undefined or Option<T>. See harness:functional.\n" >&2
  printf "Override (library boundary): tag the line '// allow-null: <reason>'.\n" >&2
  exit 2
fi

exit 0
