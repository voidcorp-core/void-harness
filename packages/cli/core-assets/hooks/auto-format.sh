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
FILE=$(hooklib_file)

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -n "$FILE" && -f "$FILE" ]] || exit 0
[[ "$FILE" =~ \.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$ ]] || exit 0

# Resolve Biome without installing anything. Prefer a project-local binary.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
if [[ -x "$ROOT/node_modules/.bin/biome" ]]; then
  BIOME="$ROOT/node_modules/.bin/biome"
elif command -v biome >/dev/null 2>&1; then
  BIOME="biome"
else
  exit 0
fi

"$BIOME" format --write "$FILE" >/dev/null 2>&1 || true
exit 0
