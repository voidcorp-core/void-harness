#!/usr/bin/env bash
# block-dangerous-bash — PreToolUse hook. Reads the agent's tool-call JSON from
# stdin. Blocks catastrophic, irreversible shell commands (the kind no diff
# review can undo). Deterministic, non-skippable counterpart to gstack /careful,
# and the safety floor for unattended / autonomous runs. Runtime-agnostic:
# matches Claude's "Bash" tool and Codex's "shell" tool (command as string or
# argv array).
#
# Override (a deliberate, reviewed command): export VOID_HARNESS_ALLOW_DANGEROUS=1
# for the single run. The autonomous loops deliberately leave it unset.
#
# Exit codes: 0 allow, 2 block.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
CMD=$(printf "%s" "$INPUT" | jq -r 'if (.tool_input.command? | type) == "array" then (.tool_input.command | join(" ")) else (.tool_input.command // empty) end' 2>/dev/null || true)

case "$TOOL" in Bash|shell) ;; *) exit 0 ;; esac
[[ -z "$CMD" ]] && exit 0
[[ "${VOID_HARNESS_ALLOW_DANGEROUS:-}" == "1" ]] && exit 0

block() {
  printf "block-dangerous-bash: refusing a destructive command.\n" >&2
  printf "Matched: %s\n" "$1" >&2
  printf "If this is deliberate and reviewed: VOID_HARNESS_ALLOW_DANGEROUS=1.\n" >&2
  exit 2
}

# Recursive delete of a root-ish path. Two conditions, both required:
#   (a) an rm with a recursive flag (-r / -R / -rf / -fr / --recursive)
#   (b) a catastrophic target. Quotes are stripped first so "$HOME" and '/' are
#       seen; the target must immediately follow the flags and terminate, so
#       rm -rf ./dist, /tmp/x, ~/.cache/x, build/* are NOT matched.
# Covers: / /* ~ ~/ $HOME ${HOME} . ./ ./* * (with optional -- and quotes).
NORM=$(printf "%s" "$CMD" | tr -d "\"'")
if printf "%s" "$NORM" | grep -qE '(^|[;&|[:space:]])rm([[:space:]]+(-[a-zA-Z]+|--[a-z-]+))*[[:space:]]+(-[a-zA-Z]*r|--recursive)' \
  && printf "%s" "$NORM" | grep -qE '(^|[;&|[:space:]])rm([[:space:]]+[a-zA-Z-]+)*[[:space:]]+(--[[:space:]]+)?(/|/\*|~|~/|\$HOME|\$\{HOME\}|\.|\./|\./\*|\*)([[:space:]]|$)'; then
  block "recursive delete of a root path"
fi

# Fork bomb.
printf "%s" "$CMD" | grep -qE ':\(\)[[:space:]]*\{[[:space:]]*:[[:space:]]*\|[[:space:]]*:' \
  && block "fork bomb"

# Filesystem / raw-device destruction.
printf "%s" "$CMD" | grep -qE '\bmkfs(\.[a-z0-9]+)?\b|\bdd\b[^|]*\bof=/dev/|>[[:space:]]*/dev/(sd|nvme|hd|disk)' \
  && block "filesystem / raw-device write"

# chmod/chown -R on a root-ish path.
printf "%s" "$NORM" | grep -qE '\bch(mod|own)[[:space:]]+-[a-zA-Z]*R[a-zA-Z]*[[:space:]]+[^[:space:]]*[[:space:]]*(/|~|\$HOME)([[:space:]]|$)' \
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
