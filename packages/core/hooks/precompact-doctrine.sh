#!/usr/bin/env bash
# precompact-doctrine — PreCompact hook. Compaction is exactly when a long
# session forgets the non-negotiable rules. Re-inject them so they survive the
# context loss. This is the harness-specific use of PreCompact that a generic
# setup does not have.
#
# Emits additionalContext via JSON on stdout. Exit code: always 0.

set -euo pipefail

cat >/dev/null  # consume stdin

read -r -d '' CONTEXT <<'EOF' || true
void-harness floor still applies after compaction:
- Safety: never edit secrets/keys/lockfiles; no destructive shell (rm -rf /,
  force-push without lease, DROP/TRUNCATE). These are hook-enforced.
- Quality: TDD (test before code), no `any`/rogue `as`, no `console.log`, respect
  boundary direction. Tests/typecheck/lint must be green before "done".
- Doctrine lives in .void/PHILOSOPHY.md and .void/PROJECT-DOCTRINE.md — re-read if
  unsure. Capture new rules via capture-rule, never silently.
EOF

jq -cn --arg ctx "$CONTEXT" \
  '{hookSpecificOutput: {hookEventName: "PreCompact", additionalContext: $ctx}}'
exit 0
