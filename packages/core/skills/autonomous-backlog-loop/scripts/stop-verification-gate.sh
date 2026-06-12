#!/usr/bin/env bash
# stop-verification-gate — OPT-IN Stop hook. Reads Claude Code JSON from stdin.
# Blocks the end of a turn while the project's checks are red, so the agent
# "keeps going until done" (the creators' named mechanism for autonomous work).
#
# This is deliberately NOT wired into the core plugin: the harness default keeps
# the human in the loop (see harness:verification-before-completion). Enable it only
# for an autonomous run, by adding it to a Stop matcher in the run's settings:
#   "hooks": { "Stop": [ { "hooks": [ { "type": "command",
#     "command": "<abs-path>/stop-verification-gate.sh" } ] } ] }
#
# Config: VOID_VERIFY_CMD (default "pnpm -s test"). Exit 0 allow stop, 2 block.

set -euo pipefail

INPUT=$(cat)

# Never re-block our own continuation — avoids an infinite stop loop.
ACTIVE=$(printf "%s" "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)
[[ "$ACTIVE" == "true" ]] && exit 0

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || exit 0

# Only gate when source actually changed this session; no-op sessions pass.
if git -C "$ROOT" diff --quiet -- '*.ts' '*.tsx' 2>/dev/null \
  && git -C "$ROOT" diff --cached --quiet -- '*.ts' '*.tsx' 2>/dev/null; then
  exit 0
fi

CMD="${VOID_VERIFY_CMD:-pnpm -s test}"
if ! ( cd "$ROOT" && eval "$CMD" >/tmp/void-verify.$$ 2>&1 ); then
  printf "stop-verification-gate: checks are red, keep going.\n" >&2
  printf "Command: %s\n" "$CMD" >&2
  tail -20 /tmp/void-verify.$$ >&2 || true
  rm -f /tmp/void-verify.$$
  exit 2
fi

rm -f /tmp/void-verify.$$
exit 0
