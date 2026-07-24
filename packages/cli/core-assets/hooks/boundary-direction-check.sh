#!/usr/bin/env bash
# boundary-direction-check — PreToolUse hook. Reads the runtime's JSON from stdin.
# Enforces @repo/* import direction in a Turborepo workspace:
#   @repo/<X> (in packages/<X>/) may ONLY import from @repo/core.
# Composes with harness-monorepo:dependency-direction.
# Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"
source "${BASH_SOURCE[0]%/*}/_checks.sh"

hooklib_read
TOOL=$(hooklib_tool)

# Claude edits one file at a time (Edit|Write); Codex applies a multi-file diff
# (apply_patch). hooklib_edits normalizes both into one record per edited file,
# so this hook enforces identically on either runtime instead of reading an
# empty payload under Codex (a wired-but-dead hook = a silent enforcement hole).
case "$TOOL" in Edit|Write|apply_patch) ;; *) exit 0 ;; esac
hooklib_require_jq boundary-direction-check

while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  FILE="${REC%%"$_HOOKLIB_US"*}"
  NEW="${REC#*"$_HOOKLIB_US"}"
  [[ -z "$FILE" || -z "$NEW" ]] && continue

  # Normalize the absolute path the runtime passes so the ^packages/ anchor
  # below matches (#62); the lib compares physical paths (symlinked roots).
  FILE=$(hooklib_relpath "$FILE")

  # Detection (packages/<X>/ gating + @repo/* direction, .ts/.tsx only) lives in
  # _checks.sh, shared verbatim with the CI diff driver (DEV-393). Returns 0 for
  # apps/, packages/core/ and test/generated files.
  VIOLATIONS=$(printf "%s" "$NEW" | checks_boundary_imports "$FILE") && continue

  PKG=$(printf "%s" "$FILE" | sed -E 's|^packages/([^/]+)/.*|\1|')
  printf "boundary-direction-check: forbidden @repo/* import from packages/%s/\n" "$PKG" >&2
  printf "%s\n" "$VIOLATIONS" >&2
  printf "Packages may only import from @repo/core. For cross-package deps,\n" >&2
  printf "define a port in this package and wire the adapter in the consuming app.\n" >&2
  printf "See harness-monorepo:dependency-direction.\n" >&2
  printf "Override (documented): tag the import line '// allow-boundary: <reason>'.\n" >&2
  exit 2
done < <(hooklib_edits)

exit 0
