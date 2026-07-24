#!/usr/bin/env bash
# auto-format — PostToolUse hook. After an Edit/Write, format the touched file
# with Biome so the "last 10%" of style never reaches CI or a review. This is
# the non-blocking complement to the blocking PreToolUse grep hooks: it repairs
# instead of refusing. Fails open — if Biome is not resolvable, it does nothing.
#
# Exit code: always 0 (formatting must never block a turn).

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

hooklib_read
TOOL=$(hooklib_tool)

# Claude edits one file (Edit|Write); Codex applies a multi-file diff
# (apply_patch) — every file it touched deserves the same formatting pass.
case "$TOOL" in Edit|Write|apply_patch) ;; *) exit 0 ;; esac

# Resolve Biome without installing anything. Prefer a project-local binary.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [[ -x "$ROOT/node_modules/.bin/biome" ]]; then
  BIOME="$ROOT/node_modules/.bin/biome"
elif command -v biome >/dev/null 2>&1; then
  BIOME="biome"
else
  exit 0
fi

format_one() {
  local file="$1"
  [[ -n "$file" && -f "$file" ]] || return 0
  [[ "$file" =~ \.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$ ]] || return 0
  "$BIOME" format --write "$file" >/dev/null 2>&1 || true
}

# hooklib_edits already degrades to the pure-bash file_path when jq is absent,
# so this needs no jq branch of its own (the hook fails open by contract — it
# must never block a turn).
while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  format_one "${REC%%"$_HOOKLIB_US"*}"
done < <(hooklib_edits)

exit 0
