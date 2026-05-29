#!/usr/bin/env bash
# no-only-no-skip — pre-commit hook
#
# Blocks commits with `.only` / `.skip` / `fdescribe` / `xit` / `xdescribe`
# in test files. They mean "I will not run this." Use `it.todo('description')`
# instead.
#
# Whitelist: **/__skip-on-purpose__/** (rare, justified).
# Composed with the `testing` skill.
#
# Exit codes: 0 allow, 1 block.

set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(test|spec)\.(ts|tsx|js|jsx)$' || true)
[[ -z "$STAGED" ]] && exit 0

VIOLATIONS=""
for FILE in $STAGED; do
  [[ "$FILE" =~ /__skip-on-purpose__/ ]] && continue

  ADDED=$(git diff --cached -- "$FILE" | grep -E '^\+' | grep -v '^+++' || true)
  HITS=$(printf "%s" "$ADDED" | grep -nE '\b(describe|it|test)\.only\b|\.skip\b|\bfdescribe\b|\bxit\b|\bxdescribe\b' || true)
  if [[ -n "$HITS" ]]; then
    VIOLATIONS="${VIOLATIONS}\n  $FILE:\n$HITS"
  fi
done

if [[ -n "$VIOLATIONS" ]]; then
  printf "no-only-no-skip: focused or skipped tests detected:" >&2
  printf "%b\n" "$VIOLATIONS" >&2
  printf "\nUse 'it.todo(...)' for placeholders. Remove '.only'/'.skip' before committing.\n" >&2
  exit 1
fi
