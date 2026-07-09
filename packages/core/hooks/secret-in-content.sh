#!/usr/bin/env bash
# secret-in-content — PreToolUse hook (Edit|Write). Reads Claude Code JSON from
# stdin. Blocks writing a HIGH-CONFIDENCE secret into ANY file — the companion to
# protect-sensitive-files, which only guards known secret FILENAMES. A key pasted
# into a normal source file would otherwise pass silently.
#
# Scope: the edit's new content only (bounded — never scans the repo; that is
# gitleaks/CI). POSIX ERE only (no grep -P, #64). Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"
source "${BASH_SOURCE[0]%/*}/_checks.sh"

hooklib_read
TOOL=$(hooklib_tool)
FILE=$(hooklib_file)

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" ]] && exit 0
hooklib_require_jq secret-in-content
NEW=$(hooklib_content)
[[ -z "$NEW" ]] && exit 0

# Detection (high-confidence tokens + generic assignments, test-fixture paths
# exempt) lives in _checks.sh, shared verbatim with the CI diff driver (DEV-393).
HITS=$(printf "%s" "$NEW" | checks_secret_content "$FILE") && exit 0
printf "secret-in-content: a likely secret was detected in %s\n%s\n\n" "$FILE" "$HITS" >&2
printf "Never commit secrets to source. Use an env var (.env, ignored) + @repo/core/env.\n" >&2
printf "False positive (a fixture / placeholder)? tag the line '// allow-secret-pattern: <reason>'.\n" >&2
exit 2
