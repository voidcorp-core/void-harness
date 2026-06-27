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

# --- structured activation event (seeds Phase 2 should-have-fired analysis) ---
# Best-effort: captures only names/event/tool, NEVER file contents or secrets.
ACT_LOG="$LOG_DIR/activations.jsonl"
if command -v jq >/dev/null 2>&1; then
  printf '%s' "$INPUT" | jq -c \
    --arg ts "$TS" --arg kind "skill" --arg name "$SKILL" \
    '{ts:$ts, kind:$kind, name:$name, event:(.hook_event_name // ""), trigger:{tool:(.tool_name // "")}, sessionId:(.session_id // "")}' \
    >>"$ACT_LOG" 2>/dev/null || true
else
  printf '{"ts":"%s","kind":"skill","name":"%s","event":"","trigger":{},"sessionId":""}\n' \
    "$TS" "$SKILL" >>"$ACT_LOG" 2>/dev/null || true
fi
exit 0
