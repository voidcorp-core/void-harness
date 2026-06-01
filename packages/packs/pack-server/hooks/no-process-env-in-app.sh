#!/usr/bin/env bash
# no-process-env-in-app — PreToolUse hook for Edit/Write.
# Blocks `process.env.X` in apps/*/src/** files, forcing imports from
# @repo/core/env (or equivalent). Composes with the void-server:env-validation
# skill which says "validate once at boot, expose typed object".
#
# Exemptions:
#   - The env module itself (packages/core/src/env*.ts) is allowed
#   - Lines tagged `// allow-process-env: <reason>` (rare, justified)
#
# Inputs (set by the void-harness hook runner):
#   VOIDCORP_HOOK_FILE / VOIDCORP_HOOK_PHASE
# Exit codes: 0 allow, 1 block.

set -euo pipefail

FILE="${VOIDCORP_HOOK_FILE:-}"
PHASE="${VOIDCORP_HOOK_PHASE:-pre}"
[[ -z "$FILE" || "$PHASE" != "pre" ]] && exit 0

# Only check files under apps/<app>/src/
re_app='apps/[^/]+/src/'
[[ "$FILE" =~ $re_app ]] || exit 0

# Skip env modules (rare in apps/* — env usually lives in packages/core),
# tests, scripts, generated files, .d.ts.
re_skip='/env(-(client|server))?\.ts$|\.(test|spec)\.(ts|tsx)$|/__generated__/|\.d\.ts$|/scripts/'
[[ "$FILE" =~ $re_skip ]] && exit 0

# Only .ts / .tsx
[[ "$FILE" =~ \.(ts|tsx)$ ]] || exit 0
[[ -f "$FILE" ]] || exit 0

# Match process.env.<NAME> (but NOT process.env alone, used in some edge
# patterns like `Object.keys(process.env)`).
re_proc='\bprocess\.env\.[A-Z_]'

HITS=$(grep -nE "$re_proc" "$FILE" | grep -vE '// *allow-process-env:' || true)

if [[ -n "$HITS" ]]; then
  printf "no-process-env-in-app: process.env.X usage detected:\n  %s\n" "$FILE" >&2
  printf "%s\n" "$HITS" >&2
  printf "\nImport from @repo/core/env (validated, typed) instead.\n" >&2
  printf "See the void-server:env-validation skill for the pattern.\n" >&2
  printf "Override (rare, justified): tag the line '// allow-process-env: <reason>'.\n" >&2
  exit 1
fi

exit 0
