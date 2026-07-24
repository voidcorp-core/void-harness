#!/usr/bin/env bash
# no-null-grep — PreToolUse hook. Reads the runtime's tool-call JSON from stdin.
# Blocks edits introducing `null` in business code. Prefer `undefined` or
# Option<T>. Composes with harness:functional and harness:typescript-strict.
# Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

hooklib_read
TOOL=$(hooklib_tool)

# Claude edits one file at a time (Edit|Write); Codex applies a multi-file diff
# (apply_patch). hooklib_edits normalizes both into one record per edited file,
# so this hook enforces identically on either runtime instead of reading an
# empty payload under Codex (a wired-but-dead hook = a silent enforcement hole).
case "$TOOL" in Edit|Write|apply_patch) ;; *) exit 0 ;; esac
hooklib_require_jq no-null-grep

# Match `null` as identifier
re_null='\bnull\b'
# Library-boundary false positives (whole-content escape hatch, per file).
re_boundary='from .drizzle-orm|JSON\.(stringify|parse)|typeof.*=== .null'

while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  FILE="${REC%%"$_HOOKLIB_US"*}"
  NEW="${REC#*"$_HOOKLIB_US"}"
  [[ -z "$FILE" || -z "$NEW" ]] && continue
  [[ "$FILE" =~ \.(ts|tsx)$ ]] || continue
  [[ "$FILE" =~ \.(test|spec)\.(ts|tsx)$|\.d\.ts$|/__generated__/ ]] && continue
  printf "%s" "$NEW" | grep -qE "$re_boundary" && continue

  # Match `null` per line on a comment- and string-stripped view, so the literal
  # substring `null` inside a `//` comment, a `/* */` block, or a quoted string
  # is not flagged. This is a line-oriented heuristic, not an AST: a `null` inside
  # a multi-line block comment or template literal split across the edit chunk may
  # still be reported — tag such a line with `// allow-null:` to override.
  # The override is checked on the RAW line (stripping would erase the tag).
  HITS=""
  lineno=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
    printf "%s" "$line" | grep -qE '// *allow-null:' && continue
    code=$(printf "%s" "$line" | sed -E \
      -e 's@"([^"\\]|\\.)*"@@g' \
      -e "s@'([^'\\\\]|\\\\.)*'@@g" \
      -e 's@`[^`]*`@@g' \
      -e 's@/\*.*\*/@@g' \
      -e 's@//.*@@')
    if printf "%s" "$code" | grep -qE "$re_null"; then
      HITS+="${lineno}:${line}"$'\n'
    fi
  done < <(printf "%s" "$NEW")

  if [[ -n "$HITS" ]]; then
    printf "no-null-grep: 'null' literal in %s\n%s\n" "$FILE" "$HITS" >&2
    printf "Prefer undefined or Option<T>. See harness:functional.\n" >&2
    printf "Override (library boundary): tag the line '// allow-null: <reason>'.\n" >&2
    exit 2
  fi
done < <(hooklib_edits)

exit 0
