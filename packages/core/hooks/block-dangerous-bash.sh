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
source "${BASH_SOURCE[0]%/*}/_checks.sh"

hooklib_read
TOOL=$(hooklib_tool)
# hooklib_command joins a Codex argv array; without jq it degrades to the
# pure-bash .command scalar (string commands still screened, better than 127).
CMD=$(hooklib_command)

case "$TOOL" in Bash|shell) ;; *) exit 0 ;; esac
[[ -z "$CMD" ]] && exit 0
[[ "${VOID_HARNESS_ALLOW_DANGEROUS:-}" == "1" ]] && exit 0

# The catastrophic-pattern blocklist lives in _checks.sh (checks_dangerous_command),
# shared verbatim with the CI diff driver so a destructive pattern committed into a
# script is caught server-side too (DEV-393).
MATCH=$(printf "%s" "$CMD" | checks_dangerous_command) && exit 0
printf "block-dangerous-bash: refusing a destructive command.\n" >&2
printf "Matched: %s\n" "$MATCH" >&2
printf "If this is deliberate and reviewed: VOID_HARNESS_ALLOW_DANGEROUS=1.\n" >&2
exit 2
