#!/usr/bin/env bash
# block-dangerous-bash — PreToolUse hook. Reads the agent's tool-call JSON from
# stdin. A BEST-EFFORT guardrail against the most common catastrophic shell
# footguns (recursive root/home deletes, fork bombs, raw-device writes,
# force-push, destructive SQL). It is NOT a complete safety boundary: it is a
# pattern blocklist and will miss novel forms. The real floor for unattended /
# autonomous runs is the scoped allowlist + sandbox (see settings.autonomous.json
# and docs/CODEX.md), which is deny-by-default. This hook is the secondary
# tripwire. Runtime-agnostic: Claude "Bash" + Codex "shell" (string or argv array).
#
# Override (a deliberate, reviewed command): export VOID_HARNESS_ALLOW_DANGEROUS=1
# for the single run. The autonomous loops deliberately leave it unset.
#
# Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

hooklib_read
TOOL=$(hooklib_tool)
# hooklib_command joins a Codex argv array; without jq it degrades to the
# pure-bash .command scalar (string commands still screened, better than 127).
CMD=$(hooklib_command)

case "$TOOL" in Bash|shell) ;; *) exit 0 ;; esac
[[ -z "$CMD" ]] && exit 0
[[ "${VOID_HARNESS_ALLOW_DANGEROUS:-}" == "1" ]] && exit 0

block() {
  printf "block-dangerous-bash: refusing a destructive command.\n" >&2
  printf "Matched: %s\n" "$1" >&2
  printf "If this is deliberate and reviewed: VOID_HARNESS_ALLOW_DANGEROUS=1.\n" >&2
  exit 2
}

# Catastrophic target patterns (quotes stripped first so "$HOME" and '/' are
# seen). Each root may carry an optional trailing "/" and/or "*", so $HOME/,
# ${HOME}/*, ~/* and /* are all caught, while $HOME/projects, ~/.cache/x,
# /tmp/x and build/* are NOT (the target must terminate at the root).
#   HOME_ROOT: filesystem root / home only (for chmod/chown).
#   RM_TARGET: HOME_ROOT plus cwd-wiping forms (. ./ ./* .* *) for rm.
HOME_ROOT='(/\*?|~/?\*?|\$HOME/?\*?|\$\{HOME\}/?\*?)'
RM_TARGET='('"$HOME_ROOT"'|\./?\*?|\*)'
NORM=$(printf "%s" "$CMD" | tr -d "\"'")

# Recursive delete of a root-ish path: an rm with a recursive flag AND a
# catastrophic target immediately after the flags.
if printf "%s" "$NORM" | grep -qE '(^|[;&|[:space:]])rm([[:space:]]+(-[a-zA-Z]+|--[a-z-]+))*[[:space:]]+(-[a-zA-Z]*[rR]|--recursive)' \
  && printf "%s" "$NORM" | grep -qE "(^|[;&|[:space:]])rm([[:space:]]+[a-zA-Z-]+)*[[:space:]]+(--[[:space:]]+)?${RM_TARGET}([[:space:]]|$)"; then
  block "recursive delete of a root path"
fi

# Fork bomb.
printf "%s" "$CMD" | grep -qE ':\(\)[[:space:]]*\{[[:space:]]*:[[:space:]]*\|[[:space:]]*:' \
  && block "fork bomb"

# Filesystem / raw-device destruction.
printf "%s" "$CMD" | grep -qE '\bmkfs(\.[a-z0-9]+)?\b|\bdd\b[^|]*\bof=/dev/|>[[:space:]]*/dev/(sd|nvme|hd|disk)' \
  && block "filesystem / raw-device write"

# chmod/chown -R on the filesystem root or home: recursive flag AND a HOME_ROOT
# target anywhere in the command (chmod -R 777 $HOME/ , chown -R ~ , ...).
if printf "%s" "$NORM" | grep -qE 'ch(mod|own)([[:space:]]+[a-zA-Z0-9-]+)*[[:space:]]+(-[a-zA-Z]*R|--recursive)' \
  && printf "%s" "$NORM" | grep -qE "[[:space:]](--[[:space:]]+)?${HOME_ROOT}([[:space:]]|$)"; then
  block "recursive permission/ownership change on a root path"
fi

# Force-push without the safe --force-with-lease variant. The force flag must
# follow `git push` within the SAME command segment ([^&|;]*), so an unrelated
# `rm -f` or `git add -f` elsewhere in a compound command is not misread as a
# force-push. --force-with-lease is allowed for free: `--force([^-]|$)` does not
# match the `-with-lease` suffix (a dash follows `force`), so no separate
# (and previously broken: `--` parsed as a grep option) negative check is needed.
if printf "%s" "$CMD" | grep -qE 'git[[:space:]]+push\b[^&|;]*[[:space:]](--force([^-]|$)|-f([[:space:]]|$))'; then
  block "git push --force (use --force-with-lease)"
fi

# git history-rewrite flags that execute arbitrary commands or write outside the
# working tree. The autonomous profile allows `git rebase --onto`; --exec turns
# that into code execution, --unsafe-paths lets `git apply` write anywhere, and
# --rebase-merges / --strategy-option widen the blast radius. Scoped to the
# relevant subcommands so a commit/merge message mentioning the flag is not hit.
if printf "%s" "$CMD" | grep -qE '\bgit\b([[:space:]]+-[^[:space:]]+)*[[:space:]]+(rebase|am|apply|cherry-pick)\b' \
  && printf "%s" "$CMD" | grep -qE '(--exec([[:space:]=]|$)|--rebase-merges|--strategy-option|--unsafe-paths)'; then
  block "git command-execution / unsafe-path flag"
fi

# Destructive SQL against a live database.
printf "%s" "$CMD" | grep -qiE '\b(drop[[:space:]]+(database|table|schema)|truncate[[:space:]]+table)\b' \
  && block "destructive SQL (DROP / TRUNCATE)"

exit 0
