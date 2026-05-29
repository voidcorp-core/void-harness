#!/usr/bin/env bash
# no-as-cast-grep — pre-commit hook
#
# Warns (does NOT block) on `as <Type>` casts outside the allowed set:
#   - `as const` (always allowed)
#   - `as unknown` (allowed as narrowing stepping stone)
#   - `as React.ReactNode` (common JSX pattern)
#   - Smart-constructor returns (lines marked `// allow-as: smart-constructor`)
#
# Composed with the `typescript-strict` skill. Warns because false positives
# are common; the author confirms or refactors.
#
# Exit codes: 0 allow, 2 warn.

set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' || true)
[[ -z "$STAGED" ]] && exit 0

WARNINGS=""
for FILE in $STAGED; do
  [[ "$FILE" =~ /__fixtures__/ || "$FILE" =~ /__tests__/ ]] && continue

  ADDED=$(git diff --cached -- "$FILE" | grep -E '^\+' | grep -v '^+++' || true)
  HITS=$(printf "%s" "$ADDED" \
    | grep -nE '\bas\s+[A-Z][A-Za-z0-9_]*' \
    | grep -vE '\bas\s+(const|unknown)\b' \
    | grep -vE '\bas\s+React\.' \
    | grep -vE '// *allow-as:' \
    || true)
  if [[ -n "$HITS" ]]; then
    WARNINGS="${WARNINGS}\n  $FILE:\n$HITS"
  fi
done

if [[ -n "$WARNINGS" ]]; then
  printf "no-as-cast-grep (warn): unusual 'as <Type>' casts detected:" >&2
  printf "%b\n" "$WARNINGS" >&2
  printf "\nPrefer 'satisfies', 'schema.parse()', or smart constructors.\n" >&2
  printf "If intentional, tag the line with '// allow-as: <reason>'.\n" >&2
  exit 2
fi
