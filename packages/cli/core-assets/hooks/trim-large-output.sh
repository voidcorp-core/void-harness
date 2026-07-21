#!/usr/bin/env bash
# trim-large-output — PostToolUse hook, the token-frugality lever (measured:
# on real feature sessions, Bash/build output + MCP payloads dominate context
# growth, not file exploration). When a Bash or MCP tool result is larger than a
# threshold, spill the FULL output to .void/outputs/ and return a trimmed view
# (head + tail + the error-ish lines from the elided middle + a pointer to the
# full file) via `updatedToolOutput`, so the model keeps the signal without the
# bulk. The agent greps the spill file for anything elided — nothing is lost.
#
# Safety by construction:
#   - NEVER touches Read/Edit/Write results (the agent needs the whole file it is
#     about to edit; trimming those would make it work blind). Bash + MCP only.
#   - PostToolUse => never alters command execution, only what enters context.
#   - Fail-OPEN: any uncertainty (no jq, unparseable response, write failure)
#     passes the original through unchanged. Best-effort, always exit 0.
#
# Disable:   export VOID_HARNESS_NO_TRIM=1
# Threshold: export VOID_HARNESS_TRIM_BYTES=<chars>   (default 12000)

set -uo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

[[ "${VOID_HARNESS_NO_TRIM:-}" == "1" ]] && exit 0
hooklib_read
# Without jq we cannot safely parse tool_response nor emit valid JSON: pass through.
[[ "${HOOK_JQ:-0}" == 1 ]] || exit 0

TOOL=$(hooklib_tool)
case "$TOOL" in
  Bash | shell) ;;
  mcp__*) ;;
  *) exit 0 ;;
esac

THRESH="${VOID_HARNESS_TRIM_BYTES:-12000}"

# A defensive text view of tool_response: string as-is; array of content blocks
# joined; object -> stdout/stderr/output/result/content joined; else nothing.
TEXT=$(printf '%s' "$HOOK_INPUT" | jq -r '
  .tool_response as $r
  | if   ($r|type)=="string" then $r
    elif ($r|type)=="array"  then ($r | map(.text? // (if type=="string" then . else "" end)) | join("\n"))
    elif ($r|type)=="object" then
      ( [ $r.stdout?, $r.stderr?, $r.output?, $r.result?,
          ( $r.content? | if type=="array" then (map(.text? // "")|join("\n")) elif type=="string" then . else empty end )
        ] | map(select(type=="string" and . != "")) | join("\n") )
    else empty end
' 2>/dev/null) || TEXT=""

LEN=${#TEXT}
# Small, empty, or unparseable => leave the original untouched.
[[ "$LEN" -le "$THRESH" ]] && exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
DIR="$ROOT/.void/outputs"
mkdir -p "$DIR" 2>/dev/null || exit 0
HASH=$(printf '%s' "$TEXT" | cksum | cut -d' ' -f1)
FILE="$DIR/${TOOL//[^A-Za-z0-9_]/_}-$$-$HASH.log"
printf '%s' "$TEXT" >"$FILE" 2>/dev/null || exit 0
REL="${FILE#"$ROOT"/}"

HEAD=$(printf '%s' "$TEXT" | head -c 3000)
TAIL=$(printf '%s' "$TEXT" | tail -c 3000)
# Never hide a failure: pull likely error lines out of the elided middle.
ERRS=$(printf '%s' "$TEXT" | grep -niE 'error|fail|exception|traceback|fatal|panic|not ok|assert' 2>/dev/null | head -c 1500)

TRIMMED=$(printf '%s\n\n…[trimmed %s chars. Full output on disk: %s — read/grep it for the elided middle]…\n\n%s\n\n[error-ish lines from the middle]\n%s\n' \
  "$HEAD" "$LEN" "$REL" "$TAIL" "$ERRS")

jq -n --arg out "$TRIMMED" --arg note "trim-large-output: $TOOL result ${LEN}c trimmed; full at $REL" \
  '{hookSpecificOutput: {hookEventName: "PostToolUse", updatedToolOutput: $out, additionalContext: $note}}'
exit 0
