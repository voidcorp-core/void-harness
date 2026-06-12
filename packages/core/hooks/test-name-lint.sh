#!/usr/bin/env bash
# test-name-lint — PreToolUse hook. Reads Claude Code JSON from stdin.
# Lints test names for the harness:testing convention:
#   - it('does X when Y')  — observable behavior, not "should ..."
# Blocks generic / template names. Exit codes: 0 allow, 2 block.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
FILE=$(printf "%s" "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW=$(printf "%s" "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" || -z "$NEW" ]] && exit 0
[[ "$FILE" =~ \.(test|spec)\.(ts|tsx|js|jsx)$ ]] || exit 0

# Forbidden generic patterns: "should ..." prefix, "works", literal "test"
re_generic="\\b(it|test)\\([[:space:]]*['\"]should[[:space:]]|\\b(it|test)\\([[:space:]]*['\"]works?\\b|\\b(it|test)\\([[:space:]]*['\"]test['\"]"

HITS=$(printf "%s" "$NEW" | grep -nE "$re_generic" || true)

if [[ -n "$HITS" ]]; then
  printf "test-name-lint: generic test name in %s\n%s\n\n" "$FILE" "$HITS" >&2
  printf "Test names should describe observable behavior, not 'should X' or 'works'.\n" >&2
  printf "Good:  it('returns the user when given a valid ID')\n" >&2
  printf "Bad:   it('should work')  /  it('test')  /  it('should return user')\n" >&2
  exit 2
fi

exit 0
