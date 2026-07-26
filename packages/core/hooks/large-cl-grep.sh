#!/usr/bin/env bash
# Compatibility adapter; portable policy lives in @voidcorp/hook-runner.
set -uo pipefail
HOOK_DIR="${BASH_SOURCE[0]%/*}"
NODE_BIN=$(command -v node 2>/dev/null || true)
if [[ -z "$NODE_BIN" ]]; then
  exit 0
fi
exec "$NODE_BIN" "$HOOK_DIR/_void-hook.mjs" lifecycle large-change "${VOID_AGENT_RUNTIME:-unknown}"
