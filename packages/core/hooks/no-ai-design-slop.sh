#!/usr/bin/env bash
# no-ai-design-slop — PreToolUse hook. Reads Claude Code JSON from stdin.
# A static gate (not the live /design-review in gstack) that blocks a few NET
# "AI design tells": an explicitly-set default Inter font, cliché two-stop
# gradients, cards nested directly in cards, and grey text on a coloured
# background. Composes with the frontend-design skill. Kept deliberately
# conservative — only unambiguous patterns block; tag a line `// allow-design-slop:`
# (or `/* allow-design-slop: */`) to override.
# Exit codes: 0 allow, 2 block.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
FILE=$(printf "%s" "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW=$(printf "%s" "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" || -z "$NEW" ]] && exit 0
# Style-bearing files only: components/markup and stylesheets.
[[ "$FILE" =~ \.(tsx|jsx|css|scss)$ ]] || exit 0
[[ "$FILE" =~ \.(test|spec)\.(tsx|jsx)$|/__generated__/|/__fixtures__/ ]] && exit 0

# Net AI design tells. Each is intentionally specific to keep false positives low.
#  1. Explicit default Inter font (font-family declaration or Tailwind font-[Inter]).
re_inter='font-family[^;]*\bInter\b|font-\[.?Inter|fontFamily[^,]*\bInter\b'
#  2. Cliché two-stop gradient: purple/indigo/violet -> blue/cyan/teal (either order),
#     Tailwind or CSS.
re_grad='(from|to)-(purple|indigo|violet|fuchsia)-[0-9]+[^"'\'' ]*[^"'\'']*(from|to)-(blue|cyan|teal|sky|indigo)-[0-9]+|linear-gradient\([^)]*(purple|indigo|violet)[^)]*(blue|cyan|teal)'
#  3. Grey/slate/gray/zinc text token placed together with a coloured background
#     token on the same line (low-contrast "grey on color" tell).
re_grey='\btext-(gray|grey|slate|zinc|neutral)-[0-9]+\b[^"'\'']*\bbg-(indigo|purple|blue|violet|fuchsia|emerald|rose|pink)-[0-9]+\b'

HITS=""
lineno=0
while IFS= read -r line || [[ -n "$line" ]]; do
  lineno=$((lineno + 1))
  printf "%s" "$line" | grep -qiE '(//|/\*) *allow-design-slop:' && continue
  # Strip strings and comments so a literal tell inside a string/comment is ignored,
  # while real class/style attributes (which live in JSX/HTML strings) are kept by
  # NOT stripping double-quoted attribute values. We strip only line/block comments
  # and template literals; className strings must survive to be inspected.
  code=$(printf "%s" "$line" | sed -E \
    -e 's@`[^`]*`@@g' \
    -e 's@/\*.*\*/@@g' \
    -e 's@//.*@@')
  reason=""
  printf "%s" "$code" | grep -qiE "$re_inter" && reason="default Inter font set explicitly"
  printf "%s" "$code" | grep -qiE "$re_grad"  && reason="cliché purple/indigo->blue gradient"
  printf "%s" "$code" | grep -qiE "$re_grey"  && reason="grey text on a coloured background"
  if [[ -n "$reason" ]]; then
    HITS+="${lineno}: ${reason}"$'\n'
  fi
done < <(printf "%s" "$NEW")

# Card-nested-in-card: a per-line regex cannot see structure, so check the whole
# edit for two `card` class tokens with no intervening close — only flag the blunt
# case of a literal nested card class on adjacent class lists.
if printf "%s" "$NEW" | grep -qiE 'class(Name)?="[^"]*\bcard\b[^"]*"[^>]*>[^<]*<[^>]*class(Name)?="[^"]*\bcard\b'; then
  if ! printf "%s" "$NEW" | grep -qiE '(//|/\*) *allow-design-slop:'; then
    HITS+="0: card nested directly inside a card"$'\n'
  fi
fi

if [[ -n "$HITS" ]]; then
  printf "no-ai-design-slop: AI design tells in %s\n%s\n" "$FILE" "$HITS" >&2
  printf "These read as generic AI output. See the frontend-design skill.\n" >&2
  printf "Override (brand-justified): tag the line '// allow-design-slop: <reason>'.\n" >&2
  exit 2
fi

exit 0
