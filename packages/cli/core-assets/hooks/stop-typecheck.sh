#!/usr/bin/env bash
# stop-typecheck — Stop hook, ADVISORY. At end of turn, if a TS project has
# uncommitted .ts changes, run a bounded `tsc --noEmit` scoped to the nearest
# tsconfig of the touched files and surface the result — so the "typecheck clean"
# item of verification-before-completion is answered from observation, not belief.
#
# NEVER blocks: a blocking Stop would trap the session. Exit 0 always. No-op with
# no TS project, no TS edits, or no tsc. Timeout caps the cost.

set -uo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"
hooklib_read  # consume stdin

ROOT=$(hooklib_root)
cd "$ROOT" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0

# Touched TS this session ~= uncommitted working-tree changes (tracked + new).
CHANGED=$( { git diff --name-only --diff-filter=ACM HEAD 2>/dev/null; \
             git ls-files --others --exclude-standard 2>/dev/null; } \
           | grep -E '\.(ts|tsx)$' | grep -vE '\.d\.ts$' || true )
[[ -z "$CHANGED" ]] && exit 0

# Nearest tsconfig dir for a file (walk up to ROOT). Empty if none.
nearest() {
  local d; d=$(dirname "$1")
  while [[ "$d" != "." && "$d" != "/" ]]; do
    [[ -f "$d/tsconfig.json" ]] && { printf '%s\n' "$d"; return; }
    d=$(dirname "$d")
  done
  [[ -f "tsconfig.json" ]] && printf '.\n'
}
DIRS=$(while IFS= read -r f; do [[ -n "$f" ]] && nearest "$f"; done <<<"$CHANGED" | sort -u)
[[ -z "$DIRS" ]] && exit 0

# Resolve tsc (project-local preferred) and a timeout wrapper if available.
if [[ -x node_modules/.bin/tsc ]]; then TSC="node_modules/.bin/tsc"
elif command -v tsc >/dev/null 2>&1; then TSC="tsc"
else exit 0; fi
TO=""; command -v timeout >/dev/null 2>&1 && TO="timeout 45"; command -v gtimeout >/dev/null 2>&1 && TO="gtimeout 45"

ERRORS=""
while IFS= read -r dir; do
  [[ -z "$dir" ]] && continue
  OUT=$($TO "$TSC" --noEmit -p "$dir/tsconfig.json" 2>&1); CODE=$?
  [[ $CODE -eq 124 ]] && { printf 'stop-typecheck: tsc exceeded 45s in %s, skipped (advisory).\n' "$dir" >&2; continue; }
  [[ $CODE -ne 0 ]] && ERRORS="${ERRORS}$(printf '%s\n' "$OUT" | grep -E 'error TS' | head -15)"$'\n'
done <<<"$DIRS"

if [[ -n "${ERRORS// /}" ]]; then
  printf 'stop-typecheck (advisory): tsc --noEmit found type errors in the touched TS surface:\n' >&2
  printf '%s' "$ERRORS" | sed '/^$/d' | head -20 >&2
  printf 'Resolve before claiming done (verification-before-completion). This never blocks.\n' >&2
fi
exit 0
