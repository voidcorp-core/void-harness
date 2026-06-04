#!/usr/bin/env bash
# skill-usage-meter — PreToolUse hook on the Skill tool. Appends one line per
# skill invocation to .void/usage.log so the outbound self-evolution audit
# (`void-harness audit`) has real data on which skills fire and which are dead.
# Observation only: never blocks, never edits.
#
# Exit code: always 0.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
[[ "$TOOL" == "Skill" ]] || exit 0

SKILL=$(printf "%s" "$INPUT" | jq -r '.tool_input.skill // .tool_input.name // .tool_input.command // "unknown"')
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOG_DIR="$ROOT/.void"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown")
printf "%s\t%s\n" "$TS" "$SKILL" >>"$LOG_DIR/usage.log" 2>/dev/null || true
exit 0
