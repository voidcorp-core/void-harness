#!/usr/bin/env bash
# activation-meter — universal PreToolUse meter. Appends one structured JSONL
# event per tool invocation to .void/activations.jsonl (seeds the Phase 2 live
# view + the should-have-fired analysis). Also keeps the legacy usage.log line
# for kind=skill (consumed by `void-harness audit` + the studio usage halos).
#
# Captures NAMES / TOOL / event / relativized file paths + extensions ONLY.
# NEVER file contents, NEVER secrets. Best-effort: never blocks, always exit 0.
#
# Event shape: { ts, kind: skill|agent|workflow|tool, name, event,
#                trigger: { tool, fileGlobs[], ext[] }, sessionId }

# Deliberately no `set -e`: a universal hook must never abort a tool call.
set -uo pipefail

INPUT=$(cat 2>/dev/null) || INPUT=""
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOG_DIR="$ROOT/.void"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown")
ACT_LOG="$LOG_DIR/activations.jsonl"
USAGE_LOG="$LOG_DIR/usage.log"

if command -v jq >/dev/null 2>&1; then
  EVENT=$(printf '%s' "$INPUT" | jq -c --arg ts "$TS" --arg root "$ROOT" '
    (.tool_name // "") as $tool
    | (if $tool=="Skill" then "skill"
       elif $tool=="Task" then "agent"
       elif $tool=="Workflow" then "workflow"
       else "tool" end) as $kind
    | (if $kind=="skill" then (.tool_input.skill // .tool_input.name // .tool_input.command // "unknown")
       elif $kind=="agent" then (.tool_input.subagent_type // "claude")
       elif $kind=="workflow" then (.tool_input.name // "inline")
       else $tool end) as $name
    | ($root | length + 1) as $off
    | ([.tool_input.file_path?, .tool_input.path?, .tool_input.pattern?]
       | map(select(type == "string"))) as $raw
    | ($raw | map(if startswith($root + "/") then .[$off:] else . end)) as $globs
    | ($globs | map(select(test("\\.[^/.]+$")) | sub(".*\\."; ""))) as $exts
    | {ts: $ts, kind: $kind, name: $name, event: (.hook_event_name // ""),
       trigger: {tool: $tool, fileGlobs: $globs, ext: $exts}, sessionId: (.session_id // "")}
  ' 2>/dev/null) || EVENT=""
  [ -n "$EVENT" ] && printf '%s\n' "$EVENT" >>"$ACT_LOG" 2>/dev/null || true
  if printf '%s' "$INPUT" | jq -e '.tool_name == "Skill"' >/dev/null 2>&1; then
    SKILL=$(printf '%s' "$INPUT" | jq -r '.tool_input.skill // .tool_input.name // .tool_input.command // "unknown"' 2>/dev/null)
    printf '%s\t%s\n' "$TS" "$SKILL" >>"$USAGE_LOG" 2>/dev/null || true
  fi
else
  # --- jq-less fallback: pure-bash regex extraction (no external tools) ---
  grab() {
    local re="\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\""
    if [[ "$INPUT" =~ $re ]]; then printf '%s' "${BASH_REMATCH[1]}"; fi
  }
  TOOL=$(grab tool_name)
  case "$TOOL" in
    Skill) KIND=skill; NAME=$(grab skill); [ -z "$NAME" ] && NAME=$(grab name); [ -z "$NAME" ] && NAME=$(grab command); [ -z "$NAME" ] && NAME=unknown ;;
    Task) KIND=agent; NAME=$(grab subagent_type); [ -z "$NAME" ] && NAME=claude ;;
    Workflow) KIND=workflow; NAME=$(grab name); [ -z "$NAME" ] && NAME=inline ;;
    *) KIND=tool; NAME="$TOOL" ;;
  esac
  printf '{"ts":"%s","kind":"%s","name":"%s","event":"","trigger":{"tool":"%s","fileGlobs":[],"ext":[]},"sessionId":""}\n' \
    "$TS" "$KIND" "$NAME" "$TOOL" >>"$ACT_LOG" 2>/dev/null || true
  [ "$TOOL" = "Skill" ] && printf '%s\t%s\n' "$TS" "$NAME" >>"$USAGE_LOG" 2>/dev/null || true
fi

exit 0
