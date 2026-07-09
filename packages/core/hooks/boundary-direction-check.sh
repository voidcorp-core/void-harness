#!/usr/bin/env bash
# boundary-direction-check — PreToolUse hook. Reads Claude Code JSON from stdin.
# Enforces @repo/* import direction in a Turborepo workspace:
#   @repo/<X> (in packages/<X>/) may ONLY import from @repo/core.
# Composes with harness-monorepo:dependency-direction.
# Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"
source "${BASH_SOURCE[0]%/*}/_checks.sh"

hooklib_read
TOOL=$(hooklib_tool)
FILE=$(hooklib_file)

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" ]] && exit 0

# Normalize the absolute path Claude Code passes so the ^packages/ anchor
# below matches (#62); the lib compares physical paths (symlinked roots).
FILE=$(hooklib_relpath "$FILE")

hooklib_require_jq boundary-direction-check
NEW=$(hooklib_content)
[[ -z "$NEW" ]] && exit 0

# Detection (packages/<X>/ gating + @repo/* direction) lives in _checks.sh,
# shared verbatim with the CI diff driver (DEV-393). Returns 0 for apps/,
# packages/core/ and test/generated files.
VIOLATIONS=$(printf "%s" "$NEW" | checks_boundary_imports "$FILE") && exit 0

PKG=$(printf "%s" "$FILE" | sed -E 's|^packages/([^/]+)/.*|\1|')
printf "boundary-direction-check: forbidden @repo/* import from packages/%s/\n" "$PKG" >&2
printf "%s\n" "$VIOLATIONS" >&2
printf "Packages may only import from @repo/core. For cross-package deps,\n" >&2
printf "define a port in this package and wire the adapter in the consuming app.\n" >&2
printf "See harness-monorepo:dependency-direction.\n" >&2
printf "Override (documented): tag the import line '// allow-boundary: <reason>'.\n" >&2
exit 2
