#!/usr/bin/env bash
# sessionstart-context — SessionStart hook. Injects a short reminder of the void
# doctrine + the installed harness version so a session starts with it in mind.
# SessionStart fires with source `compact` after a compaction, so this also
# re-establishes the doctrine post-compaction (PreCompact cannot inject context,
# so there is no separate PreCompact hook). Static doctrine stays in CLAUDE.md;
# this is the dynamic, per-session nudge.
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
