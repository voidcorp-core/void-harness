#!/usr/bin/env bash
# tdd-guard — PreToolUse hook for Edit/Write.
# Materializes the Iron Law of void:tdd (strict mode blocks, souple warns,
# exploratory no-op). See plans/skill-audits/tdd.md for the 10 legitimate bypasses.
#
# Inputs (set by the hook runner):
#   VOIDCORP_HOOK_FILE / VOIDCORP_HOOK_TOOL / VOIDCORP_HOOK_PHASE / VOIDCORP_HOOK_DIFF
# Config: .void/config.json (paths.business, paths.spikes, modes.tdd).
# Exit codes: 0 allow, 1 block, 2 warn.
#
# Portability: regex patterns held in variables for bash 3.2 (macOS) compat.

set -euo pipefail

FILE="${VOIDCORP_HOOK_FILE:-}"
PHASE="${VOIDCORP_HOOK_PHASE:-pre}"
[[ -z "$FILE" || "$PHASE" != "pre" ]] && exit 0

CONFIG="${VOIDCORP_CONFIG:-.void/config.json}"
MODE=$(jq -r '.modes.tdd // "auto"' "$CONFIG" 2>/dev/null || echo "auto")
[[ -z "$MODE" ]] && MODE="auto"
BUSINESS_GLOB=$(jq -r '.paths.business // "apps/*/src/**"' "$CONFIG" 2>/dev/null || echo "apps/*/src/**")
[[ -z "$BUSINESS_GLOB" ]] && BUSINESS_GLOB="apps/*/src/**"
SPIKES_GLOB=$(jq -r '.paths.spikes // "apps/*/scripts/spike-*"' "$CONFIG" 2>/dev/null || echo "apps/*/scripts/spike-*")
[[ -z "$SPIKES_GLOB" ]] && SPIKES_GLOB="apps/*/scripts/spike-*"

# Bypasses (Section 0bis.3). Patterns in variables for bash 3.2 compat.
re_doc='\.(md|mdx|txt)$|(^|/)docs/'
re_test_or_dts='\.(test|spec)\.(ts|tsx|js|jsx)$|\.d\.ts$'
re_config='/(package|tsconfig|vitest\.config|playwright\.config|biome|eslint\.config|next\.config|tailwind\.config|drizzle\.config)\.(json|ts|js|mjs|cjs)$'
re_paths='/(tests?|__tests__)/fixtures/|/seed/|/migrations/|/drizzle/meta/|/codemods?/|/__generated__/'
re_exploratory='//[[:space:]]*tdd-mode:[[:space:]]*exploratory'

[[ "$FILE" =~ $re_doc ]] && exit 0
[[ "$FILE" =~ $re_test_or_dts ]] && exit 0
[[ "$FILE" =~ $re_config ]] && exit 0
[[ "$FILE" =~ $re_paths ]] && exit 0
case "$FILE" in $SPIKES_GLOB) exit 0 ;; esac
head -3 "$FILE" 2>/dev/null | grep -q "@generated" && exit 0
head -5 "$FILE" 2>/dev/null | grep -qE "$re_exploratory" && exit 0

# Mode resolution: file-header marker > .void/config.json > "auto"
re_header_mode='//[[:space:]]*tdd-mode:[[:space:]]*(strict|souple)'
HEADER_MODE=$(head -5 "$FILE" 2>/dev/null | grep -oE "$re_header_mode" | grep -oE '(strict|souple)' || true)
EFFECTIVE_MODE="${HEADER_MODE:-$MODE}"
[[ "$EFFECTIVE_MODE" == "exploratory" ]] && exit 0

# Business path check — outside the business glob, allow.
case "$FILE" in $BUSINESS_GLOB) ;; *) exit 0 ;; esac

# Pure-deletion bypass via staged diff.
if [[ -n "${VOIDCORP_HOOK_DIFF:-}" ]]; then
  ADDS=$(printf "%s" "$VOIDCORP_HOOK_DIFF" | grep -cE "^\+[^+]" || true)
  [[ "$ADDS" == "0" ]] && exit 0
fi

# Test-pairing check: is the sibling test file also staged?
TEST_FILE_TS="${FILE%.ts}.test.ts"
TEST_FILE_TSX="${FILE%.tsx}.test.tsx"
STAGED=$(git diff --cached --name-only 2>/dev/null || echo "")
if printf "%s\n" "$STAGED" | grep -qE "(^|/)$(basename "$TEST_FILE_TS")$|(^|/)$(basename "$TEST_FILE_TSX")$"; then
  exit 0
fi

MSG="tdd-guard: production edit in '$FILE' without a corresponding test change in the same staged set.
  Mode: $EFFECTIVE_MODE
  Expected sibling test: $TEST_FILE_TS or $TEST_FILE_TSX
  See plans/skill-audits/tdd.md. Override: '// tdd-mode: exploratory' or set mode in $CONFIG."

if [[ "$EFFECTIVE_MODE" == "strict" || "$EFFECTIVE_MODE" == "auto" ]]; then
  printf "%s\n" "$MSG" >&2
  exit 1
fi
printf "warning: %s\n" "$MSG" >&2
exit 2
