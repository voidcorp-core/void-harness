#!/usr/bin/env bash
# boundary-direction-check — pre-commit hook
#
# Blocks commits that violate the hexagonal-architecture dependency direction:
# domain code MUST NOT import from infrastructure / adapters / framework runtime.
#
# Composed with the `hexagonal-architecture` skill.
#
# Configuration via .void/config.json:
#   paths.domain        — domain code (forbidden to import from infra)
#   paths.adapters      — adapter implementations (allowed to import infra)
#   paths.infrastructure — raw infrastructure (drizzle config, sdk clients)
#
# Default forbidden patterns for files matching $DOMAIN:
#   - import from a path containing /infrastructure/
#   - import from a path containing /adapters/
#   - import from a framework runtime (next/server, drizzle-orm, stripe, ...)
#
# Exit codes: 0 allow, 1 block.

set -euo pipefail

CONFIG="${VOIDCORP_CONFIG:-.void/config.json}"
DOMAIN_GLOB=$(jq -r '.paths.domain // "**/{domain,services/business}/**"' "$CONFIG" 2>/dev/null)
INFRA_PATTERNS=$(jq -r '.boundary.forbiddenInfraImports[]? // empty' "$CONFIG" 2>/dev/null)
[[ -z "$INFRA_PATTERNS" ]] && INFRA_PATTERNS=$'/infrastructure/\n/adapters/\nnext/server\ndrizzle-orm\nstripe\n@anthropic-ai/sdk\nopenai\nresend'

STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' || true)
[[ -z "$STAGED" ]] && exit 0

VIOLATIONS=""
for FILE in $STAGED; do
  case "$FILE" in
    $DOMAIN_GLOB) ;;
    *) continue ;;
  esac

  ADDED=$(git diff --cached -- "$FILE" | grep -E '^\+' | grep -v '^+++' || true)
  IMPORT_LINES=$(printf "%s" "$ADDED" | grep -E "^\+.*(import |from ['\"])" || true)
  [[ -z "$IMPORT_LINES" ]] && continue

  while IFS= read -r PATTERN; do
    [[ -z "$PATTERN" ]] && continue
    MATCH=$(printf "%s" "$IMPORT_LINES" | grep -F "$PATTERN" || true)
    if [[ -n "$MATCH" ]]; then
      VIOLATIONS="${VIOLATIONS}\n  $FILE imports '$PATTERN':\n$MATCH"
    fi
  done <<< "$INFRA_PATTERNS"
done

if [[ -n "$VIOLATIONS" ]]; then
  cat >&2 <<EOF
boundary-direction-check: forbidden imports in domain code:
$(printf "%b" "$VIOLATIONS")

The hexagonal-architecture skill says: domain code MUST NOT import from
infrastructure or adapters. Move the I/O into an adapter behind a port
owned by the domain, then inject the port at the use-case boundary.
EOF
  exit 1
fi
