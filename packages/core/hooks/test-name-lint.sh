#!/usr/bin/env bash
# test-name-lint — PreToolUse hook. Reads the runtime's JSON from stdin.
# Lints test names for the harness:testing convention:
#   - it('does X when Y')  — observable behavior, not "should ..."
# Blocks generic / template names. Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

hooklib_read
TOOL=$(hooklib_tool)

# Claude edits one file at a time (Edit|Write); Codex applies a multi-file diff
# (apply_patch). hooklib_edits normalizes both into one record per edited file,
# so this hook enforces identically on either runtime instead of reading an
# empty payload under Codex (a wired-but-dead hook = a silent enforcement hole).
case "$TOOL" in Edit|Write|apply_patch) ;; *) exit 0 ;; esac
hooklib_require_jq test-name-lint

# Forbidden generic patterns: "should ..." prefix, "works", literal "test"
re_generic="\\b(it|test)\\([[:space:]]*['\"]should[[:space:]]|\\b(it|test)\\([[:space:]]*['\"]works?\\b|\\b(it|test)\\([[:space:]]*['\"]test['\"]"

while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  FILE="${REC%%"$_HOOKLIB_US"*}"
  NEW="${REC#*"$_HOOKLIB_US"}"
  [[ -z "$FILE" || -z "$NEW" ]] && continue
  [[ "$FILE" =~ \.(test|spec)\.(ts|tsx|js|jsx)$ ]] || continue

  HITS=$(printf "%s" "$NEW" | grep -nE "$re_generic" || true)

  if [[ -n "$HITS" ]]; then
    printf "test-name-lint: generic test name in %s\n%s\n\n" "$FILE" "$HITS" >&2
    printf "Test names should describe observable behavior, not 'should X' or 'works'.\n" >&2
    printf "Good:  it('returns the user when given a valid ID')\n" >&2
    printf "Bad:   it('should work')  /  it('test')  /  it('should return user')\n" >&2
    exit 2
  fi
done < <(hooklib_edits)

exit 0
