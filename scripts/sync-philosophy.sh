#!/usr/bin/env bash
# sync-philosophy — enforce docs/PHILOSOPHY.md <-> packages/core/PHILOSOPHY.md parity.
#
# The harness carries the doctrine three times:
#   docs/PHILOSOPHY.md                     what we read in this repo
#   packages/core/PHILOSOPHY.md            what install writes into a consumer
#   packages/cli/core-assets/PHILOSOPHY.md the npm mirror
#
# The third is GENERATED from the second by copy-core-assets.mjs, and the
# "core-assets in sync with core" gate (CI + .githooks/pre-commit) already
# regenerates it and fails on drift. This script therefore covers only the leg
# nothing else covers: docs <-> core. Neither of those two generates the other,
# so the check is byte equality rather than regeneration.
#
# Why byte equality and not heading parity (the sister-doc rule's approach): the
# two copies are the SAME document for the same audience, not a Claude/Codex pair
# with adapted terminology. Any difference is drift. The drift this gate was
# written for was six reworded sentences that left every heading intact, so a
# heading comparison would have passed while consumers installed a doctrine
# older than the one we were reading.
#
# Test override: --files <docs-md> <core-md> points at arbitrary files.
#
# Exit codes: 0 in parity, 1 on drift or a missing file.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DOCS="$ROOT/docs/PHILOSOPHY.md"
CORE="$ROOT/packages/core/PHILOSOPHY.md"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --files) DOCS="$2"; CORE="$3"; shift 3 ;;
    *) echo "sync-philosophy: unknown arg '$1'" >&2; exit 1 ;;
  esac
done

for f in "$DOCS" "$CORE"; do
  [[ -f "$f" ]] || { echo "sync-philosophy: missing $f" >&2; exit 1; }
done

if ! diff -q "$DOCS" "$CORE" >/dev/null; then
  echo "sync-philosophy: drift between the read and the shipped doctrine." >&2
  echo "  (< $DOCS   > $CORE)" >&2
  diff "$DOCS" "$CORE" >&2 || true
  echo "  Decide which side is current, apply it to BOTH, then regenerate the" >&2
  echo "  npm mirror: pnpm --filter voidharness build:assets" >&2
  exit 1
fi

echo "sync-philosophy: doctrine in parity ($(wc -l <"$DOCS" | tr -d ' ') lines)."
exit 0
