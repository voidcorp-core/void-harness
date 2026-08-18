#!/usr/bin/env bash
# tidying-commit-prefix — commit-msg hook
#
# Warns (does NOT block) when a `refactor:` commit subject is paired with
# behavior-change keywords in the body (feat, fix, implement, add). The
# Two-Hat principle says: Tidyings and Behavior Changes never share a commit.
#
# Composed with the `refactor` skill.
#
# Inputs: $1 = path to the commit message file.
# Exit codes: 0 allow, 2 warn.

set -euo pipefail

MSG_FILE="${1:-}"
[[ -z "$MSG_FILE" || ! -f "$MSG_FILE" ]] && exit 0

SUBJECT=$(head -1 "$MSG_FILE")
BODY=$(tail -n +2 "$MSG_FILE")

# Only check refactor: commits
echo "$SUBJECT" | grep -qE '^refactor[(:]' || exit 0

# Look for behavior-change keywords in body
if printf "%s" "$BODY" | grep -qiE '\b(feat|feature|fix|bug|implement|add a new|adds a new)\b'; then
  cat >&2 <<EOF
tidying-commit-prefix (warn): 'refactor:' subject paired with behavior-change keywords in body.

The Two-Hat principle (Beck "Tidy First?" 2023) says Tidyings and Behavior Changes
never share a commit. If this commit does both, split it:
  refactor: <named Fowler move>
  feat: <new behavior>

If the body is descriptive of the structural change only, ignore this warning.
EOF
  exit 2
fi
