#!/usr/bin/env bash
# anti-bloat-check — root-level audit of the seven anti-bloat rules
# documented in CLAUDE.md / AGENTS.md.
#
# Run locally: `pnpm anti-bloat:check`
# Also wired into .github/workflows/ci.yml on every PR.
#
# Exit codes: 0 = all checks pass, 1 = at least one rule violated.

set -euo pipefail

FAILED=0

echo "anti-bloat-check"

# Rule 1: SKILL.md ≤ 400 LOC
echo "  rule 1: SKILL.md ≤ 400 LOC"
OVERSIZE=$(find packages/core/skills -name SKILL.md -exec wc -l {} \; 2>/dev/null | awk '$1 > 400 { print }')
if [[ -n "$OVERSIZE" ]]; then
  echo "    FAIL: SKILL.md exceeds 400 LOC:" >&2
  echo "$OVERSIZE" >&2
  FAILED=1
fi

# Rule 5: hooks ≤ 100 LOC
echo "  rule 5: hooks ≤ 100 LOC"
OVERSIZE_HOOKS=$(find packages/core/hooks -name '*.sh' -exec wc -l {} \; 2>/dev/null | awk '$1 > 100 { print }')
if [[ -n "$OVERSIZE_HOOKS" ]]; then
  echo "    FAIL: hook exceeds 100 LOC:" >&2
  echo "$OVERSIZE_HOOKS" >&2
  FAILED=1
fi

# Hook syntax
echo "  shell syntax: all hooks"
for f in packages/core/hooks/*.sh; do
  if ! bash -n "$f" 2>/dev/null; then
    echo "    FAIL: syntax in $f" >&2
    FAILED=1
  fi
done

# Frontmatter description ≤ 200 chars (rule 4)
echo "  rule 4: frontmatter description ≤ 200 chars"
for f in packages/core/skills/*/SKILL.md packages/core/agents/*.md; do
  [[ -e "$f" ]] || continue
  DESC=$(awk '/^description:/{ sub(/^description: */,""); print; exit }' "$f" 2>/dev/null || true)
  LEN=${#DESC}
  if [[ "$LEN" -gt 200 ]]; then
    echo "    FAIL: $f description is $LEN chars (cap 200): $DESC" >&2
    FAILED=1
  fi
done

# Skill name convention (Anthropic Agent Skills spec): the frontmatter `name`
# must equal the parent directory name and match ^[a-z0-9]+(-[a-z0-9]+)*$
# (lowercase, hyphen-separated, no leading/trailing/double hyphen). A mismatch
# breaks auto-discovery silently, so it is a hard gate.
echo "  skill name == folder + naming convention"
for f in packages/core/skills/*/SKILL.md packages/packs/*/skills/*/SKILL.md; do
  [[ -e "$f" ]] || continue
  DIR=$(basename "$(dirname "$f")")
  NAME=$(awk '/^name:/{ sub(/^name: */,""); print; exit }' "$f" 2>/dev/null || true)
  if [[ -z "$NAME" ]]; then
    echo "    FAIL: $f has no frontmatter 'name:'" >&2
    FAILED=1
    continue
  fi
  if [[ "$NAME" != "$DIR" ]]; then
    echo "    FAIL: $f name '$NAME' != folder '$DIR'" >&2
    FAILED=1
  fi
  if [[ ! "$NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "    FAIL: $f name '$NAME' violates ^[a-z0-9]+(-[a-z0-9]+)*\$" >&2
    FAILED=1
  fi
done

if [[ "$FAILED" -eq 0 ]]; then
  echo "anti-bloat-check: all checks passed."
else
  echo "anti-bloat-check: at least one rule violated." >&2
fi
exit "$FAILED"
