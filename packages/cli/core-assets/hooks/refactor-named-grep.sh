#!/usr/bin/env bash
# refactor-named-grep — commit-msg hook
#
# Warns (does NOT block) on `refactor:` commit subjects that do not name a
# recognized Fowler refactor from the allowlist (../fowler-refactors.txt).
# Encourages clear vocabulary in git log.
#
# Composed with the `refactor` skill.
#
# Inputs: $1 = path to the commit message file.
# Exit codes: 0 allow, 2 warn.

set -euo pipefail

MSG_FILE="${1:-}"
[[ -z "$MSG_FILE" || ! -f "$MSG_FILE" ]] && exit 0

SUBJECT=$(head -1 "$MSG_FILE")
echo "$SUBJECT" | grep -qE '^refactor[(:]' || exit 0

# Locate the allowlist
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST="$HOOK_DIR/fowler-refactors.txt"
[[ ! -f "$ALLOWLIST" ]] && exit 0   # no allowlist available, skip silently

# Lowercase the subject for matching
SUBJECT_LOWER=$(printf "%s" "$SUBJECT" | tr '[:upper:]' '[:lower:]')

MATCHED=0
while IFS= read -r NAME; do
  [[ -z "$NAME" || "$NAME" =~ ^# ]] && continue
  NAME_LOWER=$(printf "%s" "$NAME" | tr '[:upper:]' '[:lower:]')
  if printf "%s" "$SUBJECT_LOWER" | grep -qF "$NAME_LOWER"; then
    MATCHED=1
    break
  fi
done < "$ALLOWLIST"

if [[ "$MATCHED" -eq 0 ]]; then
  cat >&2 <<EOF
refactor-named-grep (warn): 'refactor:' subject does not name a recognized Fowler refactor.

Examples: "refactor: extract validateEmail helper", "refactor: rename userQty to userCount",
"refactor: replace magic number 0.21 with TAX_RATE".

See ${ALLOWLIST} for the allowed names.
EOF
  exit 2
fi
