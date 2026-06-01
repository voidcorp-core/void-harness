#!/usr/bin/env bash
# no-db-in-components — PreToolUse hook for Edit/Write.
# Blocks DB imports inside apps/<app>/src/components/ — components must go
# through services. Composes with hexagonal-architecture and the
# void-react convention "components/ is pure UI, no DB, no fetch".
#
# Inputs (set by the void-harness hook runner):
#   VOIDCORP_HOOK_FILE / VOIDCORP_HOOK_PHASE
# Exit codes: 0 allow, 1 block.

set -euo pipefail

FILE="${VOIDCORP_HOOK_FILE:-}"
PHASE="${VOIDCORP_HOOK_PHASE:-pre}"
[[ -z "$FILE" || "$PHASE" != "pre" ]] && exit 0

# Only check files under apps/<app>/src/components/
re_components='apps/[^/]+/src/components/'
[[ "$FILE" =~ $re_components ]] || exit 0

# Allow .test / .stories / .mdx files
re_skip='\.(test|spec|stories)\.(ts|tsx|js|jsx)$|\.mdx$'
[[ "$FILE" =~ $re_skip ]] && exit 0

# Only consider .ts / .tsx
[[ "$FILE" =~ \.(ts|tsx)$ ]] || exit 0
[[ -f "$FILE" ]] || exit 0

# Forbidden imports in components:
#   - @repo/db / @/db
#   - drizzle-orm (direct, not behind an adapter)
#   - any path containing /db/ at import time (e.g. '@/lib/db')
re_db_import='from[[:space:]]+['"'"'"](@repo/db|@/db|@/lib/db|drizzle-orm)([/'"'"'"]|$)'

HITS=$(grep -nE "$re_db_import" "$FILE" || true)
if [[ -n "$HITS" ]]; then
  printf "no-db-in-components: DB import detected in a component file:\n  %s\n" "$FILE" >&2
  printf "%s\n" "$HITS" >&2
  printf "\nComponents must call a service. Move the query into apps/<app>/src/services/, then have the component receive the data via props or call a Server Action.\n" >&2
  printf "Override (rare, justify in PR): tag the import line '// allow-db: <reason>'.\n" >&2
  # Allow surgical exception with explicit tag on the import line
  CLEAN=$(grep -nE "$re_db_import" "$FILE" | grep -vE "// *allow-db:" || true)
  [[ -z "$CLEAN" ]] && exit 0
  exit 1
fi

exit 0
