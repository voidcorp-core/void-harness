#!/usr/bin/env bash
# secret-in-content — PreToolUse hook (Edit|Write|apply_patch). Reads the runtime
# JSON from stdin. Blocks writing a HIGH-CONFIDENCE secret into ANY file — the
# companion to protect-sensitive-files, which only guards known secret FILENAMES.
# A key pasted into a normal source file would otherwise pass silently.
#
# Scope: the edit's new content only (bounded — never scans the repo; that is
# gitleaks/CI). POSIX ERE only (no grep -P, #64). Exit codes: 0 allow, 2 block.

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
hooklib_require_jq secret-in-content

while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  FILE="${REC%%"$_HOOKLIB_US"*}"
  NEW="${REC#*"$_HOOKLIB_US"}"
  [[ -z "$FILE" || -z "$NEW" ]] && continue

  # Detection (high-confidence tokens + generic assignments, test-fixture paths
  # exempt) lives in _checks.sh, shared verbatim with the CI diff driver (DEV-393).
  HITS=$(printf "%s" "$NEW" | checks_secret_content "$FILE") && continue
  printf "secret-in-content: a likely secret was detected in %s\n%s\n\n" "$FILE" "$HITS" >&2
  printf "Never commit secrets to source. Use an env var (.env, ignored) + @repo/core/env.\n" >&2
  printf "False positive (a fixture / placeholder)? tag the line '// allow-secret-pattern: <reason>'.\n" >&2
  exit 2
done < <(hooklib_edits)

exit 0
