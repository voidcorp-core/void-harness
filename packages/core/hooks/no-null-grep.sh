#!/usr/bin/env bash
# no-null-grep — pre-commit hook
#
# Warns (does NOT block) on `null` literals introduced in domain code.
# Composed with the `functional` skill (banned by default).
#
# Whitelist:
#   - lines tagged `// allow-null: <reason>`
#   - JSON parsing / external schema files (paths containing /__schemas__/)
#
# Exit codes: 0 allow, 2 warn.

set -euo pipefail

CONFIG="${VOIDCORP_CONFIG:-.void/config.json}"
DOMAIN_GLOB=$(jq -r '.paths.domain // "**/{domain,services/business}/**"' "$CONFIG" 2>/dev/null)

STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' || true)
[[ -z "$STAGED" ]] && exit 0

WARNINGS=""
for FILE in $STAGED; do
  case "$FILE" in
    $DOMAIN_GLOB) ;;
    *) continue ;;
  esac
  [[ "$FILE" =~ /__schemas__/ ]] && continue

  ADDED=$(git diff --cached -- "$FILE" | grep -E '^\+' | grep -v '^+++' | grep -vE '// *allow-null:' || true)
  HITS=$(printf "%s" "$ADDED" | grep -nE '\bnull\b' || true)
  if [[ -n "$HITS" ]]; then
    WARNINGS="${WARNINGS}\n  $FILE:\n$HITS"
  fi
done

if [[ -n "$WARNINGS" ]]; then
  printf "no-null-grep (warn): 'null' literals detected in domain code:" >&2
  printf "%b\n" "$WARNINGS" >&2
  printf "\nUse 'T | undefined' or Option<T>. Tag '// allow-null: <reason>' for surgical exceptions.\n" >&2
  exit 2
fi
