#!/usr/bin/env bash
# sync-agent-docs — enforce CLAUDE.md <-> AGENTS.md parity (the "sister doc" rule).
#
# Two modes:
#   (default / --structure)  Section-heading parity. After normalizing away the
#       known terminology variants (skill/tool, claude/codex, "(codex
#       perspective)"), the two files must expose the SAME ordered set of
#       section headings. Catches "added a section to one doc but not the
#       other". Content inside a section may legitimately differ (terminology),
#       so only headings are compared. Stateless -> runs in CI.
#   --staged  Pre-commit XOR: if a staged change touches exactly one of the two
#       files, fail. Both or neither is fine. Catches editing one in isolation.
#
# Test override: --files <claude-md> <agents-md> points at arbitrary files.
#
# Exit codes: 0 in parity, 1 on drift.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CLAUDE="$ROOT/CLAUDE.md"
AGENTS="$ROOT/AGENTS.md"
MODE="structure"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged) MODE="staged"; shift ;;
    --structure) MODE="structure"; shift ;;
    --files) CLAUDE="$2"; AGENTS="$3"; shift 3 ;;
    *) echo "sync-agent-docs: unknown arg '$1'" >&2; exit 1 ;;
  esac
done

if [[ "$MODE" == "staged" ]]; then
  STAGED=$(git diff --cached --name-only 2>/dev/null || true)
  has_claude=$(grep -qx 'CLAUDE.md' <<<"$STAGED" && echo 1 || echo 0)
  has_agents=$(grep -qx 'AGENTS.md' <<<"$STAGED" && echo 1 || echo 0)
  if [[ "$has_claude" != "$has_agents" ]]; then
    echo "sync-agent-docs: staged change touches only one sister doc." >&2
    echo "  CLAUDE.md staged: $has_claude   AGENTS.md staged: $has_agents" >&2
    echo "  Reflect the change in both (terminology adapted), then re-commit." >&2
    exit 1
  fi
  exit 0
fi

# Structure mode.
for f in "$CLAUDE" "$AGENTS"; do
  [[ -f "$f" ]] || { echo "sync-agent-docs: missing $f" >&2; exit 1; }
done

# Drop the known terminology-variant tokens word-by-word (awk, not sed \b, which
# is unsupported on BSD/macOS). What remains is the runtime-agnostic heading.
normalize_headings() {
  grep -E '^#{1,6} ' "$1" \
    | sed -E 's/^#+ //' \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9 ]//g; s/  +/ /g; s/^ +//; s/ +$//' \
    | awk '{
        out = "";
        for (i = 1; i <= NF; i++) {
          w = $i;
          if (w == "skill" || w == "tool" || w == "codex" || w == "claude" \
              || w == "code" || w == "perspective" || w == "claudemd" \
              || w == "agentsmd" || w == "agents") continue;
          out = (out == "" ? w : out " " w);
        }
        if (out != "") print out;
      }'
}

C_TMP=$(mktemp); A_TMP=$(mktemp)
trap 'rm -f "$C_TMP" "$A_TMP"' EXIT
normalize_headings "$CLAUDE" >"$C_TMP"
normalize_headings "$AGENTS" >"$A_TMP"

if ! diff -q "$C_TMP" "$A_TMP" >/dev/null; then
  echo "sync-agent-docs: section-heading drift between CLAUDE.md and AGENTS.md." >&2
  echo "  (< CLAUDE.md   > AGENTS.md, after terminology normalization)" >&2
  diff "$C_TMP" "$A_TMP" >&2 || true
  echo "  Add the missing section to the sister doc (terminology adapted)." >&2
  exit 1
fi

echo "sync-agent-docs: CLAUDE.md and AGENTS.md in parity ($(wc -l <"$C_TMP" | tr -d ' ') sections)."
exit 0
