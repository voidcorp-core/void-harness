#!/usr/bin/env bash
# activation-meter — universal PreToolUse meter. Appends one structured JSONL
# event per tool invocation to .void/activations.jsonl — the SINGLE source of
# truth for skill/agent/workflow/tool usage (seeds the live view, the
# should-have-fired analysis, and `void-harness audit`). The legacy usage.log is
# no longer written (issue #70); audit still reads any pre-existing one as
# transition history.
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

if command -v jq >/dev/null 2>&1; then
  EVENT=$(printf '%s' "$INPUT" | jq -c --arg ts "$TS" --arg root "$ROOT" '
    (.tool_name // "") as $tool
    | (if $tool=="Skill" then "skill"
       # The subagent spawn tool is `Task` in stock Claude Code and `Agent` in this
       # harness; accept both so agent spawns are never miscounted as plain tools.
       elif $tool=="Task" or $tool=="Agent" then "agent"
       elif $tool=="Workflow" then "workflow"
       else "tool" end) as $kind
    | (if $kind=="skill" then (.tool_input.skill // .tool_input.name // .tool_input.command // "unknown")
       elif $kind=="agent" then (.tool_input.subagent_type // "claude")
       elif $kind=="workflow" then
         # A scriptPath-launched workflow carries no `name`; derive the registered
         # workflow-def id from the script basename (strip .workflow.js) so it joins
         # the graph node instead of collapsing to "inline". `select` treats an empty
         # string as absent (the jq `//` operator only substitutes on null/false, not ""),
         # so an empty name or an empty basename (trailing-slash path) still falls through.
         ((.tool_input.name | select(type=="string" and . != ""))
          // (.tool_input.scriptPath
              | select(type=="string" and . != "")
              | sub(".*/";"") | sub("\\.workflow\\.js$";"") | sub("\\.js$";"")
              | select(. != ""))
          // "inline")
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
else
  # --- jq-less fallback: pure-bash regex extraction (no external tools) ---
  grab() {
    local re="\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\""
    if [[ "$INPUT" =~ $re ]]; then printf '%s' "${BASH_REMATCH[1]}"; fi
  }
  TOOL=$(grab tool_name)
  case "$TOOL" in
    Skill) KIND=skill; NAME=$(grab skill); [ -z "$NAME" ] && NAME=$(grab name); [ -z "$NAME" ] && NAME=$(grab command); [ -z "$NAME" ] && NAME=unknown ;;
    Task|Agent) KIND=agent; NAME=$(grab subagent_type); [ -z "$NAME" ] && NAME=claude ;;
    Workflow) KIND=workflow; NAME=$(grab name)
      if [ -z "$NAME" ]; then
        SP=$(grab scriptPath)
        if [ -n "$SP" ]; then NAME="${SP##*/}"; NAME="${NAME%.workflow.js}"; NAME="${NAME%.js}"; fi
      fi
      [ -z "$NAME" ] && NAME=inline ;;
    *) KIND=tool; NAME="$TOOL" ;;
  esac
  printf '{"ts":"%s","kind":"%s","name":"%s","event":"","trigger":{"tool":"%s","fileGlobs":[],"ext":[]},"sessionId":""}\n' \
    "$TS" "$KIND" "$NAME" "$TOOL" >>"$ACT_LOG" 2>/dev/null || true
fi

exit 0
