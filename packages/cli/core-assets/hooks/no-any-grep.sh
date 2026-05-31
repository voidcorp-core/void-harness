#!/usr/bin/env bash
# no-any-grep — pre-commit hook
#
# Blocks commits that introduce `: any` or `as any` in TypeScript files
# outside the whitelist (test fixtures + magic-comment allowlist).
# Composed with the `typescript-strict` skill (zero `any` budget).
#
# Whitelist:
#   - **/__fixtures__/**
#   - **/__tests__/** (test helpers can use any for setup)
#   - Lines tagged `// allow-any: <reason>` (surgical exception)
#
# Exit codes: 0 allow, 1 block.

set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' || true)
[[ -z "$STAGED" ]] && exit 0

VIOLATIONS=""
for FILE in $STAGED; do
  [[ "$FILE" =~ /__fixtures__/ || "$FILE" =~ /__tests__/ ]] && continue

  # Grep added lines for `: any` or `as any`, excluding allow-any tagged lines
  ADDED=$(git diff --cached -- "$FILE" | grep -E '^\+' | grep -v '^+++' | grep -vE '// *allow-any:' || true)
  HITS=$(printf "%s" "$ADDED" | grep -nE ':\s*any\b|\bas\s+any\b' || true)
  if [[ -n "$HITS" ]]; then
    VIOLATIONS="${VIOLATIONS}\n  $FILE:\n$HITS"
  fi
done

if [[ -n "$VIOLATIONS" ]]; then
  printf "no-any-grep: forbidden 'any' usage detected:" >&2
  printf "%b\n" "$VIOLATIONS" >&2
  printf "\nFix with 'unknown' + narrowing, or tag the line with '// allow-any: <reason>' if surgical.\n" >&2
  exit 1
fi
