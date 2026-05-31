#!/usr/bin/env bash
# no-console-log-grep — pre-commit hook
#
# Blocks commits introducing `console.log` / `console.error` / `console.warn`
# in business code. Composed with the `observability` skill.
#
# Whitelist:
#   - scripts/** (one-shot scripts may use console.*)
#   - **/*.test.{ts,tsx,js,jsx} (test files)
#   - **/__fixtures__/**
#   - Lines tagged `// allow-console: <reason>`
#
# Exit codes: 0 allow, 1 block.

set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx|js|jsx)$' || true)
[[ -z "$STAGED" ]] && exit 0

VIOLATIONS=""
for FILE in $STAGED; do
  [[ "$FILE" =~ ^scripts/ ]] && continue
  [[ "$FILE" =~ \.(test|spec)\.(ts|tsx|js|jsx)$ ]] && continue
  [[ "$FILE" =~ /__fixtures__/ ]] && continue

  ADDED=$(git diff --cached -- "$FILE" | grep -E '^\+' | grep -v '^+++' | grep -vE '// *allow-console:' || true)
  HITS=$(printf "%s" "$ADDED" | grep -nE '\bconsole\.(log|error|warn|info|debug)\b' || true)
  if [[ -n "$HITS" ]]; then
    VIOLATIONS="${VIOLATIONS}\n  $FILE:\n$HITS"
  fi
done

if [[ -n "$VIOLATIONS" ]]; then
  printf "no-console-log-grep: console.* usage detected in business code:" >&2
  printf "%b\n" "$VIOLATIONS" >&2
  printf "\nUse @repo/core/logger (pino) instead. See the observability skill.\n" >&2
  printf "If surgical exception is needed, tag the line '// allow-console: <reason>'.\n" >&2
  exit 1
fi
