#!/usr/bin/env bash
# pre-PR-review-evidence — pre-push hook
#
# Warns (does NOT block) if the PR body lacks a Review Evidence block, in
# strict mode. Reads the PR body via `gh pr view --json body` for the
# current branch.
#
# Composed with the `code-review` skill.
#
# Strict mode trigger: pushing to a branch tracked as `main` / `develop` /
# `release/*`, OR `.voidcorp/config.json` modes.codeReview = strict.
#
# Exit codes: 0 allow, 2 warn.

set -euo pipefail

CONFIG="${VOIDCORP_CONFIG:-.voidcorp/config.json}"
MODE=$(jq -r '.modes.codeReview // "auto"' "$CONFIG" 2>/dev/null || echo "auto")
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")

# Only warn in strict (auto mode warns only on protected base branches)
case "$MODE" in
  strict) ;;
  auto)
    BASE=$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null || echo "")
    case "$BASE" in main|develop|release/*) ;; *) exit 0 ;; esac
    ;;
  *) exit 0 ;;
esac

# Need an open PR to inspect
BODY=$(gh pr view --json body --jq .body 2>/dev/null || true)
if [[ -z "$BODY" ]]; then
  printf "pre-PR-review-evidence: no open PR for branch '%s', skipping.\n" "$BRANCH" >&2
  exit 0
fi

if ! printf "%s" "$BODY" | grep -qiE '##\s*Review\s*Evidence'; then
  cat >&2 <<EOF
pre-PR-review-evidence (warn): PR body lacks a '## Review Evidence' block.

In strict mode, the PR body must include the review evidence (dimensions
covered, blockers, nits, composed agents). See the 'code-review' skill for
the template.
EOF
  exit 2
fi
