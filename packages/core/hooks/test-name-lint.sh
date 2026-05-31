#!/usr/bin/env bash
# test-name-lint — pre-commit hook
#
# Warns (does NOT block) on weak test names that match `test`, `works`,
# `should`, `it works`, or are just function names. Encourages behavior-
# describing names.
#
# Composed with the `testing` skill.
#
# Exit codes: 0 allow, 2 warn.

set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(test|spec)\.(ts|tsx|js|jsx)$' || true)
[[ -z "$STAGED" ]] && exit 0

WARNINGS=""
for FILE in $STAGED; do
  ADDED=$(git diff --cached -- "$FILE" | grep -E '^\+' | grep -v '^+++' || true)
  # Match it(...) or test(...) with a weak name
  HITS=$(printf "%s" "$ADDED" \
    | grep -nE "^\+.*\b(it|test)\(['\"](test|works|should work|it works|should)['\"]" \
    || true)
  if [[ -n "$HITS" ]]; then
    WARNINGS="${WARNINGS}\n  $FILE:\n$HITS"
  fi
done

if [[ -n "$WARNINGS" ]]; then
  printf "test-name-lint (warn): weak test names detected:" >&2
  printf "%b\n" "$WARNINGS" >&2
  printf "\nDescribe the behavior. Imperative. Specific. E.g. 'retries failed operations 3 times'.\n" >&2
  exit 2
fi
