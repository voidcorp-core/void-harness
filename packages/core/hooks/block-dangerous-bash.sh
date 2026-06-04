#!/usr/bin/env bash
# block-dangerous-bash — PreToolUse hook. Reads Claude Code JSON from stdin.
# Blocks catastrophic, irreversible shell commands (the kind no diff review can
# undo). This is the deterministic, non-skippable counterpart to gstack
# /careful, and the safety floor for unattended / autonomous runs.
#
# Override (a deliberate, reviewed command): export VOID_HARNESS_ALLOW_DANGEROUS=1
# for the single run. The autonomous-backlog-loop deliberately leaves it unset.
#
# Exit codes: 0 allow, 2 block.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
CMD=$(printf "%s" "$INPUT" | jq -r '.tool_input.command // empty')

[[ "$TOOL" == "Bash" ]] || exit 0
[[ -z "$CMD" ]] && exit 0
[[ "${VOID_HARNESS_ALLOW_DANGEROUS:-}" == "1" ]] && exit 0

block() {
  printf "block-dangerous-bash: refusing a destructive command.\n" >&2
  printf "Matched: %s\n" "$1" >&2
  printf "If this is deliberate and reviewed: VOID_HARNESS_ALLOW_DANGEROUS=1.\n" >&2
  exit 2
}

# Recursive delete of a root-ish path (/, ~, /*, $HOME, .).
printf "%s" "$CMD" | grep -qE 'rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+)+(-[a-zA-Z]+[[:space:]]+)*(/|~|/\*|\$HOME|\.)([[:space:]]|$)' \
  && block "recursive delete of a root path"

# Fork bomb.
printf "%s" "$CMD" | grep -qE ':\(\)[[:space:]]*\{[[:space:]]*:[[:space:]]*\|[[:space:]]*:' \
  && block "fork bomb"

# Filesystem / raw-device destruction.
printf "%s" "$CMD" | grep -qE '\bmkfs(\.[a-z0-9]+)?\b|\bdd\b[^|]*\bof=/dev/|>[[:space:]]*/dev/(sd|nvme|hd|disk)' \
  && block "filesystem / raw-device write"

# chmod/chown -R on a root-ish path.
printf "%s" "$CMD" | grep -qE '\bch(mod|own)[[:space:]]+-[a-zA-Z]*R[a-zA-Z]*[[:space:]]+[^[:space:]]*[[:space:]]*(/|~|\$HOME)([[:space:]]|$)' \
  && block "recursive permission/ownership change on a root path"

# Force-push without the safe --force-with-lease variant.
if printf "%s" "$CMD" | grep -qE '\bgit[[:space:]]+push\b' \
  && printf "%s" "$CMD" | grep -qE '(--force([^-]|$)|[[:space:]]-f([[:space:]]|$))' \
  && ! printf "%s" "$CMD" | grep -qE '--force-with-lease'; then
  block "git push --force (use --force-with-lease)"
fi

# Destructive SQL against a live database.
printf "%s" "$CMD" | grep -qiE '\b(drop[[:space:]]+(database|table|schema)|truncate[[:space:]]+table)\b' \
  && block "destructive SQL (DROP / TRUNCATE)"

exit 0
