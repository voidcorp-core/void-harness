#!/usr/bin/env bash
# no-console-log-grep — PreToolUse hook. Reads Claude Code JSON from stdin.
# Blocks edits introducing console.{log,error,warn,info,debug} in business code.
# Use the project logger (@repo/core/logger via pino) instead. See harness:observability.
# Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

hooklib_read
TOOL=$(hooklib_tool)

# Claude edits one file at a time (Edit|Write); Codex applies a multi-file diff
# (apply_patch). hooklib_edits normalizes both into one record per edited file,
# so this hook enforces identically on either runtime instead of reading an
# empty payload under Codex (a wired-but-dead hook = a silent enforcement hole).
case "$TOOL" in Edit|Write|apply_patch) ;; *) exit 0 ;; esac
hooklib_require_jq no-console-log-grep

re_console='\bconsole\.(log|error|warn|info|debug)\b'

while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  FILE="${REC%%"$_HOOKLIB_US"*}"
  NEW="${REC#*"$_HOOKLIB_US"}"
  [[ -z "$FILE" || -z "$NEW" ]] && continue
  [[ "$FILE" =~ \.(ts|tsx|js|jsx)$ ]] || continue

  # Normalize the absolute path the runtime passes so the ^scripts/ skip anchor
  # below matches (#62); the lib compares physical paths (symlinked roots).
  FILE=$(hooklib_relpath "$FILE")

  # Skip scripts (one-shot tools may legitimately log), tests, fixtures, generated
  [[ "$FILE" =~ ^scripts/|/scripts/|\.(test|spec)\.|/__fixtures__/|/__generated__/ ]] && continue

  HITS=$(printf "%s" "$NEW" | grep -nE "$re_console" | grep -vE '// *allow-console:' || true)

  if [[ -n "$HITS" ]]; then
    printf "no-console-log-grep: console.* in %s\n%s\n\n" "$FILE" "$HITS" >&2
    printf "Use @repo/core/logger (pino) instead. See the harness:observability skill.\n" >&2
    printf "Override (rare): tag the line '// allow-console: <reason>'.\n" >&2
    exit 2
  fi
done < <(hooklib_edits)

exit 0
