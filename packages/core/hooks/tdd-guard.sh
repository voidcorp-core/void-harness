#!/usr/bin/env bash
# tdd-guard — PreToolUse hook for Edit|Write|apply_patch. Reads the runtime JSON
# from stdin (https://code.claude.com/docs/en/hooks).
#
# Enforces the Iron Law of harness:tdd (strict mode): no production code
# without a failing test — the sibling test file MUST exist on disk before a
# business-code file is edited/created, else BLOCK with instructions.
# Mode resolution: file header `// tdd-mode: <mode>` > .void/config.json
# modes.tdd > "auto" (treated as strict in business paths).
# Exit codes: 0 allow, 2 block (the runtime sees stderr).

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

hooklib_read
TOOL=$(hooklib_tool)

# Claude edits one file (Edit|Write); Codex applies a multi-file diff
# (apply_patch). hooklib_edits normalizes both into one record per edited file.
# No hooklib_require_jq: this hook is PATH-only, and hooklib_edits degrades to
# the pure-bash file_path, so a jq-less machine keeps enforcing as before.
case "$TOOL" in Edit|Write|apply_patch) ;; *) exit 0 ;; esac

ROOT=$(hooklib_root)
CONFIG="$ROOT/.void/config.json"
MODE="auto"
BUSINESS_GLOB="apps/*/src/**"
SPIKES_GLOB="apps/*/scripts/spike-*"
# Config is jq-parsed; a missing key keeps the defaults rather than erroring.
if [[ -f "$CONFIG" ]]; then
  MODE=$(jq -r '.modes.tdd // "auto"' "$CONFIG" 2>/dev/null || echo "auto")
  BUSINESS_GLOB=$(jq -r '.paths.business // "apps/*/src/**"' "$CONFIG" 2>/dev/null || echo "apps/*/src/**")
  SPIKES_GLOB=$(jq -r '.paths.spikes // "apps/*/scripts/spike-*"' "$CONFIG" 2>/dev/null || echo "apps/*/scripts/spike-*")
fi

# Bypass patterns
re_doc='\.(md|mdx|txt)$|(^|/)docs/'
re_test_or_dts='\.(test|spec)\.(ts|tsx|js|jsx)$|\.d\.ts$'
re_config='/(package|tsconfig|vitest\.config|playwright\.config|biome|eslint\.config|next\.config|tailwind\.config|drizzle\.config)\.(json|ts|js|mjs|cjs)$'
re_paths='/(tests?|__tests__)/fixtures/|/seed/|/migrations/|/drizzle/meta/|/codemods?/|/__generated__/'

while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  FILE="${REC%%"$_HOOKLIB_US"*}"
  [[ -z "$FILE" ]] && continue

  # Claude passes ABSOLUTE paths; the globs below are project-root-anchored, so an
  # unstripped path silently fails open (#62). relpath compares physical paths.
  FILE=$(hooklib_relpath "$FILE")
  # Disk probes must not depend on the hook's cwd being the project root.
  ABS_FILE="$FILE"; [[ "$ABS_FILE" != /* ]] && ABS_FILE="$ROOT/$FILE"

  [[ "$FILE" =~ $re_doc ]] && continue
  [[ "$FILE" =~ $re_test_or_dts ]] && continue
  [[ "$FILE" =~ $re_config ]] && continue
  [[ "$FILE" =~ $re_paths ]] && continue
  case "$FILE" in $SPIKES_GLOB) continue ;; esac

  # Mode is resolved per file (a header marker only governs its own file).
  FILE_MODE="$MODE"
  if [[ -f "$ABS_FILE" ]]; then
    # Header marker: exploratory bypass
    if head -5 "$ABS_FILE" 2>/dev/null | grep -qE '//[[:space:]]*tdd-mode:[[:space:]]*exploratory'; then
      continue
    fi
    # Header marker: explicit mode override
    HEADER_MODE=$(head -5 "$ABS_FILE" 2>/dev/null | grep -oE '//[[:space:]]*tdd-mode:[[:space:]]*(strict|souple)' | grep -oE '(strict|souple)' || true)
    [[ -n "$HEADER_MODE" ]] && FILE_MODE="$HEADER_MODE"
  fi
  [[ "$FILE_MODE" == "exploratory" ]] && continue

  # Business path check
  case "$FILE" in $BUSINESS_GLOB) ;; *) continue ;; esac

  # Sibling test file must exist on disk
  TEST_TS="${FILE%.ts}.test.ts"
  TEST_TSX="${FILE%.tsx}.test.tsx"
  [[ -f "$ROOT/$TEST_TS" || -f "$ROOT/$TEST_TSX" ]] && continue

  MSG="tdd-guard: missing sibling test for production file
  File:           $FILE
  Expected test:  $TEST_TS  (or .test.tsx)
  Mode:           $FILE_MODE

  harness:tdd: a test must drive every production change. This hook enforces
  the structural floor only: a sibling test file must EXIST. It does not run
  the suite, so writing a genuinely failing test first (RED) then the code
  (GREEN) stays your responsibility, not the hook's.

  Override (rare): add '// tdd-mode: exploratory' as the first line of $FILE."

  if [[ "$FILE_MODE" == "strict" || "$FILE_MODE" == "auto" ]]; then
    printf "%s\n" "$MSG" >&2
    exit 2
  fi
  # souple — warn but allow
  printf "warning: %s\n" "$MSG" >&2
done < <(hooklib_edits)

exit 0
