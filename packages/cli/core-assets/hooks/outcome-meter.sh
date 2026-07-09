#!/usr/bin/env bash
# outcome-meter — PostToolUse + Stop meter, the VALUE side of the cost/value
# ledger (issue #71). The PreToolUse activation-meter records ATTEMPTS; this
# records COMPLETIONS to .void/outcomes.jsonl: did a tool call succeed or error
# (best-effort from tool_response), and did the session close cleanly (Stop).
# Twin of activation-meter: same standalone classification + jq-less fallback.
#
# Privacy: kind / name / status / event / sessionId ONLY. NEVER tool content,
# NEVER output, NEVER secrets. Best-effort: never blocks, always exit 0.

# Deliberately no `set -e`: a universal meter must never abort a tool call.
set -uo pipefail

INPUT=$(cat 2>/dev/null) || INPUT=""
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOG_DIR="$ROOT/.void"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown")
OUT_LOG="$LOG_DIR/outcomes.jsonl"

if command -v jq >/dev/null 2>&1; then
  EVENT=$(printf '%s' "$INPUT" | jq -c --arg ts "$TS" '
    (.session_id // "") as $sid
    | if (.hook_event_name // "") == "Stop" then
        {ts:$ts, event:"Stop", sessionId:$sid}
      else
        (.tool_name // "") as $tool
        | (if $tool=="Skill" then "skill"
           elif $tool=="Task" or $tool=="Agent" then "agent"
           elif $tool=="Workflow" then "workflow"
           else "tool" end) as $kind
        | (if $kind=="skill" then (.tool_input.skill // .tool_input.name // .tool_input.command // "unknown")
           elif $kind=="agent" then (.tool_input.subagent_type // "claude")
           elif $kind=="workflow" then (.tool_input.name // "inline")
           else $tool end) as $name
        # status: explicit error signals in tool_response -> error; a present
        # response with none -> ok; nothing knowable -> unknown. No content read.
        | (.tool_response) as $r
        | (if ($r|type)=="object" and (($r.success==false) or ($r.is_error==true) or (($r.error // null)!=null)) then "error"
           elif $r==null then "unknown"
           else "ok" end) as $status
        | {ts:$ts, event:"PostToolUse", kind:$kind, name:$name, status:$status, sessionId:$sid}
      end
  ' 2>/dev/null) || EVENT=""
  [ -n "$EVENT" ] && printf '%s\n' "$EVENT" >>"$OUT_LOG" 2>/dev/null || true
else
  # jq-less fallback: pure-bash regex extraction (POSIX bash, no GNU tools).
  # status stays "unknown" — parsing tool_response safely without jq is not worth
  # it; the kind/name still land so attempt/outcome correlation survives.
  grab() { local re="\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\""; [[ "$INPUT" =~ $re ]] && printf '%s' "${BASH_REMATCH[1]}"; }
  SID=$(grab session_id)
  if [[ "$(grab hook_event_name)" == "Stop" ]]; then
    printf '{"ts":"%s","event":"Stop","sessionId":"%s"}\n' "$TS" "$SID" >>"$OUT_LOG" 2>/dev/null || true
  else
    TOOL=$(grab tool_name)
    case "$TOOL" in
      Skill) KIND=skill; NAME=$(grab skill); [ -z "$NAME" ] && NAME=$(grab name); [ -z "$NAME" ] && NAME=unknown ;;
      Task|Agent) KIND=agent; NAME=$(grab subagent_type); [ -z "$NAME" ] && NAME=claude ;;
      Workflow) KIND=workflow; NAME=$(grab name); [ -z "$NAME" ] && NAME=inline ;;
      *) KIND=tool; NAME="$TOOL" ;;
    esac
    printf '{"ts":"%s","event":"PostToolUse","kind":"%s","name":"%s","status":"unknown","sessionId":"%s"}\n' \
      "$TS" "$KIND" "$NAME" "$SID" >>"$OUT_LOG" 2>/dev/null || true
  fi
fi

exit 0
