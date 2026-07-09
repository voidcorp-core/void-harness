#!/usr/bin/env bash
# boundary-direction-check — PreToolUse hook. Reads Claude Code JSON from stdin.
# Enforces @repo/* import direction in a Turborepo workspace:
#   @repo/<X> (in packages/<X>/) may ONLY import from @repo/core.
# Composes with harness-monorepo:dependency-direction.
# Exit codes: 0 allow, 2 block.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
FILE=$(printf "%s" "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW=$(printf "%s" "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" || -z "$NEW" ]] && exit 0

# Claude Code passes ABSOLUTE paths; the ^packages/ anchor below is
# project-root-relative, so an unstripped path silently fails open (#62).
# Compare PHYSICAL paths only (symlinked roots: macOS /var vs /private/var).
_phys() {
  local p="$1" t=""
  while [[ ! -d "$p" && "$p" == */* ]]; do t="/${p##*/}$t"; p="${p%/*}"; done
  if [[ -d "$p" ]]; then printf '%s%s' "$(cd "$p" && pwd -P)" "$t"; else printf '%s' "$1"; fi
}
if [[ "$FILE" == /* ]]; then
  ROOT=$(_phys "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}")
  ROOT="${ROOT%/}"
  FILE=$(_phys "$FILE")
  case "$FILE" in "$ROOT"/*) FILE="${FILE#"$ROOT"/}" ;; esac
fi

# Only files inside packages/<X>/ (NOT apps/, NOT packages/core/)
[[ "$FILE" =~ ^packages/[^/]+/ ]] || exit 0
[[ "$FILE" =~ ^packages/core/ ]] && exit 0
[[ "$FILE" =~ \.(test|spec)\.(ts|tsx)$|\.d\.ts$|/__generated__/ ]] && exit 0

PKG=$(printf "%s" "$FILE" | sed -E 's|^packages/([^/]+)/.*|\1|')

re_import="from[[:space:]]+['\"]@repo/([a-zA-Z0-9-]+)"

# Find lines with @repo/* imports, then check if target is forbidden
VIOLATIONS=""
while IFS= read -r line; do
  IMPORT=$(printf "%s" "$line" | grep -oE '@repo/[a-zA-Z0-9-]+' | head -1)
  TARGET=$(printf "%s" "$IMPORT" | sed 's|@repo/||')
  if [[ "$TARGET" != "core" && "$TARGET" != "$PKG" ]]; then
    VIOLATIONS="${VIOLATIONS}${line}\n"
  fi
done < <(printf "%s" "$NEW" | grep -nE "$re_import" | grep -vE '// *allow-boundary:' || true)

if [[ -n "$VIOLATIONS" ]]; then
  printf "boundary-direction-check: forbidden @repo/* import from packages/%s/\n" "$PKG" >&2
  printf "%b\n" "$VIOLATIONS" >&2
  printf "Packages may only import from @repo/core. For cross-package deps,\n" >&2
  printf "define a port in this package and wire the adapter in the consuming app.\n" >&2
  printf "See harness-monorepo:dependency-direction.\n" >&2
  printf "Override (documented): tag the import line '// allow-boundary: <reason>'.\n" >&2
  exit 2
fi

exit 0
