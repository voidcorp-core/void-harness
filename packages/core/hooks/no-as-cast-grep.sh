#!/usr/bin/env bash
# no-as-cast-grep — PreToolUse hook. Reads the runtime's tool-call JSON from stdin.
# Blocks `as Foo` and `as unknown as Foo` casts in business TS.
# Allowed: `as const`, `as readonly` (idiomatic, not casts).
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
hooklib_require_jq no-as-cast-grep

# `as <Type>`: an `as` keyword followed by an UPPERCASE-initial identifier.
# POSIX ERE, not PCRE — `grep -P` is absent on the stock BSD grep (macOS) and
# would silently match nothing, failing open (#64). No negative lookahead is
# needed: `as const` / `as readonly` are lowercase keywords, so requiring an
# uppercase initial after `as ` already excludes them (as it does the
# lowercase `as unknown` / `as string`, matched only via a trailing `as Type`).
# LC_ALL=C keeps the [A-Z] class stable across locales.
re_cast='\bas[[:space:]]+[A-Z][A-Za-z0-9_]*'

while IFS= read -r -d "$_HOOKLIB_RS" REC; do
  FILE="${REC%%"$_HOOKLIB_US"*}"
  NEW="${REC#*"$_HOOKLIB_US"}"
  [[ -z "$FILE" || -z "$NEW" ]] && continue
  [[ "$FILE" =~ \.(ts|tsx)$ ]] || continue
  [[ "$FILE" =~ \.(test|spec)\.(ts|tsx)$|\.d\.ts$|/__generated__/ ]] && continue

  HITS=$(printf "%s" "$NEW" | LC_ALL=C grep -nE "$re_cast" | grep -vE '// *allow-as-cast:' || true)

  if [[ -n "$HITS" ]]; then
    printf "no-as-cast-grep: 'as <Type>' cast detected in %s\n%s\n\n" "$FILE" "$HITS" >&2
    printf "Prefer: type guards, generics, narrowing, or Zod parse at the boundary.\n" >&2
    printf "'as const' / 'as readonly' are allowed (literal narrowing, not casts).\n" >&2
    printf "Override (rare): tag the line '// allow-as-cast: <reason>'.\n" >&2
    exit 2
  fi
done < <(hooklib_edits)

exit 0
