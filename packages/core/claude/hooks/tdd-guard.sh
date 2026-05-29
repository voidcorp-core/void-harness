#!/usr/bin/env bash
# tdd-guard — PreToolUse hook for Edit / Write
#
# Blocks edits to production paths that add new behavior without a corresponding
# test change in the same staged change set, unless a legitimate bypass applies.
# Materializes the Iron Law of `voidcorp:tdd` in strict mode (see plans/skill-audits/tdd.md).
# In `souple` mode the hook warns instead of blocks. In `exploratory` mode it is a no-op.
#
# Inputs (env vars set by the Claude Code / Codex hook runner):
#   VOIDCORP_HOOK_FILE     — absolute path of the file being edited
#   VOIDCORP_HOOK_TOOL     — Edit | Write
#   VOIDCORP_HOOK_PHASE    — pre | post
#   VOIDCORP_HOOK_DIFF     — optional, the staged diff for the file
# Config read from .voidcorp/config.json (paths.business, paths.tests, paths.spikes, etc.)
#
# Exit codes:
#   0  — allow
#   1  — block (with message on stderr)
#   2  — warn (allow, message on stderr)

set -euo pipefail

FILE="${VOIDCORP_HOOK_FILE:-}"
TOOL="${VOIDCORP_HOOK_TOOL:-Edit}"
PHASE="${VOIDCORP_HOOK_PHASE:-pre}"
[[ -z "$FILE" || "$PHASE" != "pre" ]] && exit 0

CONFIG="${VOIDCORP_CONFIG:-.voidcorp/config.json}"
MODE=$(jq -r '.modes.tdd // "auto"' "$CONFIG" 2>/dev/null || echo "auto")
BUSINESS_GLOB=$(jq -r '.paths.business // "apps/*/src/**"' "$CONFIG" 2>/dev/null)
SPIKES_GLOB=$(jq -r '.paths.spikes // "apps/*/scripts/spike-*"' "$CONFIG" 2>/dev/null)

# --- BYPASSES (Section 0bis.3 of the design spec) ---
# 1. Doc-only
[[ "$FILE" =~ \.(md|mdx|txt)$ || "$FILE" =~ ^docs/ ]] && exit 0
# 2. Config & build files
[[ "$FILE" =~ /(package|tsconfig|vitest\.config|playwright\.config|biome|eslint\.config|next\.config|tailwind\.config|drizzle\.config)\.(json|ts|js|mjs|cjs)$ ]] && exit 0
# 3. Test fixtures & seed data
[[ "$FILE" =~ /(tests?|__tests__)/fixtures/ || "$FILE" =~ /seed/ ]] && exit 0
# 4. DB migrations (covered by migrations-safety skill, not unit TDD)
[[ "$FILE" =~ /migrations/ || "$FILE" =~ /drizzle/meta/ ]] && exit 0
# 5. Spike paths
case "$FILE" in $SPIKES_GLOB) exit 0 ;; esac
# 6. Codemods
[[ "$FILE" =~ /codemods?/ ]] && exit 0
# 7. Type-only changes (.d.ts)
[[ "$FILE" =~ \.d\.ts$ ]] && exit 0
# 8. Generated code
[[ "$FILE" =~ /__generated__/ ]] && exit 0
head -3 "$FILE" 2>/dev/null | grep -q "@generated" && exit 0
# 9. The test file itself
[[ "$FILE" =~ \.(test|spec)\.(ts|tsx|js|jsx)$ ]] && exit 0
# 10. In-file marker for exploratory mode (per-file override)
head -5 "$FILE" 2>/dev/null | grep -qE "//\s*tdd-mode:\s*exploratory" && exit 0

# --- MODE CHECK ---
HEADER_MODE=$(head -5 "$FILE" 2>/dev/null | grep -oE "//\s*tdd-mode:\s*(strict|souple)" | grep -oE "(strict|souple)" || echo "")
EFFECTIVE_MODE="${HEADER_MODE:-$MODE}"
[[ "$EFFECTIVE_MODE" == "exploratory" ]] && exit 0

# --- IS THIS A BUSINESS PATH ? ---
case "$FILE" in $BUSINESS_GLOB) ;; *) exit 0 ;; esac

# --- PURE DELETION BYPASS (post-stage check) ---
# If the staged diff for this file is deletions only, allow.
if [[ -n "${VOIDCORP_HOOK_DIFF:-}" ]]; then
  ADDS=$(printf "%s" "$VOIDCORP_HOOK_DIFF" | grep -cE "^\+[^+]" || true)
  [[ "$ADDS" == "0" ]] && exit 0
fi

# --- TEST PAIRING CHECK ---
# Compute the expected sibling test file and check if it is also staged.
TEST_FILE_TS="${FILE%.ts}.test.ts"
TEST_FILE_TSX="${FILE%.tsx}.test.tsx"
STAGED=$(git diff --cached --name-only 2>/dev/null || echo "")

if echo "$STAGED" | grep -qE "(^|/)$(basename "$TEST_FILE_TS")$|(^|/)$(basename "$TEST_FILE_TSX")$"; then
  exit 0
fi

# --- VIOLATION ---
MSG="tdd-guard: production edit in '$FILE' without a corresponding test change in the same staged set.
  Mode: $EFFECTIVE_MODE
  Expected sibling test: $TEST_FILE_TS or $TEST_FILE_TSX
  See plans/skill-audits/tdd.md for the Iron Law and the bypass list.
  Override: add '// tdd-mode: exploratory' at the top of the file, or set mode in $CONFIG."

if [[ "$EFFECTIVE_MODE" == "strict" || "$EFFECTIVE_MODE" == "auto" ]]; then
  printf "%s\n" "$MSG" >&2
  exit 1
else
  printf "warning: %s\n" "$MSG" >&2
  exit 2
fi
