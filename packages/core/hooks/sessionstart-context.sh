#!/usr/bin/env bash
# sessionstart-context — SessionStart hook. Injects a short reminder that the
# void doctrine and its non-skippable safety floor are in effect, plus the
# installed harness version, so a fresh session starts with the harness in mind.
# Static doctrine stays in CLAUDE.md; this is the dynamic, per-session nudge.
#
# Emits additionalContext via JSON on stdout. Exit code: always 0.

set -euo pipefail

cat >/dev/null  # consume stdin

VERSION="unknown"
MANIFEST="${CLAUDE_PLUGIN_ROOT:-}/.claude-plugin/plugin.json"
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" && -f "$MANIFEST" ]] && command -v jq >/dev/null 2>&1; then
  VERSION=$(jq -r '.version // "unknown"' "$MANIFEST" 2>/dev/null || echo unknown)
fi

read -r -d '' CONTEXT <<EOF || true
void-harness ${VERSION} is active. Non-negotiable floor (enforced by hooks, not
optional): no editing secrets/keys/lockfiles, no destructive shell, tests are the
gate before "done". Capture a new project rule by just stating it (capture-rule).
Run \`void-harness doctor\` if anything seems off.
EOF

jq -cn --arg ctx "$CONTEXT" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
exit 0
