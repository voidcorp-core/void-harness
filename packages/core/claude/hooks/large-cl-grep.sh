#!/usr/bin/env bash
# large-cl-grep — pre-push hook
#
# Warns (does NOT block) when a PR exceeds the size threshold (~400 LOC of
# diff) without a `large-cl-justification:` marker in the PR body.
#
# Composed with the `code-review` skill (CL Size discipline, Google).
#
# Exit codes: 0 allow, 2 warn.

set -euo pipefail

THRESHOLD="${VOIDCORP_LARGE_CL_THRESHOLD:-400}"

# Compute diff size against the PR base branch
BASE=$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null || echo "")
[[ -z "$BASE" ]] && exit 0   # no open PR, skip

BASE_SHA=$(git merge-base "HEAD" "origin/$BASE" 2>/dev/null || echo "")
[[ -z "$BASE_SHA" ]] && exit 0

ADDED_LINES=$(git diff --numstat "$BASE_SHA"..HEAD 2>/dev/null | awk '{ sum += $1 } END { print sum+0 }')

if [[ "$ADDED_LINES" -gt "$THRESHOLD" ]]; then
  BODY=$(gh pr view --json body --jq .body 2>/dev/null || echo "")
  if ! printf "%s" "$BODY" | grep -qiE 'large-cl-justification\s*:'; then
    cat >&2 <<EOF
large-cl-grep (warn): PR diff is ${ADDED_LINES} LOC (threshold ${THRESHOLD}).

Either split the PR into smaller focused commits, or add a
'large-cl-justification: <reason>' marker to the PR body.
EOF
    exit 2
  fi
fi
