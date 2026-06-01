#!/usr/bin/env bash
# require-img-alt — PreToolUse hook for Edit/Write.
# Blocks `<img ...>` and `<Image ...>` tags without an `alt` attribute in
# .tsx files under apps/*/src/components/ or packages/ui/. Composes with
# the void-react:accessibility-check skill (point 2: labels and names).
#
# Inputs (set by the void-harness hook runner):
#   VOIDCORP_HOOK_FILE / VOIDCORP_HOOK_PHASE
# Exit codes: 0 allow, 1 block.

set -euo pipefail

FILE="${VOIDCORP_HOOK_FILE:-}"
PHASE="${VOIDCORP_HOOK_PHASE:-pre}"
[[ -z "$FILE" || "$PHASE" != "pre" ]] && exit 0

# Only check tsx/jsx files in component-shaped paths.
re_path='apps/[^/]+/src/components/|packages/[^/]+/src/'
[[ "$FILE" =~ $re_path ]] || exit 0
[[ "$FILE" =~ \.(tsx|jsx)$ ]] || exit 0
[[ -f "$FILE" ]] || exit 0

# Skip tests / stories / mdx.
re_skip='\.(test|spec|stories)\.(tsx|jsx)$|\.mdx$'
[[ "$FILE" =~ $re_skip ]] && exit 0

# Match opening `<img ... >` or `<Image ... >` (next/image, react-native Image).
# Two passes:
#   1. Find any opening tag that doesn't already contain `alt=`.
#   2. Allow lines tagged `// allow-no-alt: <reason>` (rare: decorative,
#      with aria-hidden="true" nearby).
re_tag='<(img|Image)([[:space:]>][^/>]*)?>'

# Pull lines with an opening tag.
HITS=$(grep -nE "$re_tag" "$FILE" | grep -vE 'alt[[:space:]]*=' | grep -vE '// *allow-no-alt:' || true)

if [[ -n "$HITS" ]]; then
  printf "require-img-alt: <img> or <Image> without an alt attribute in:\n  %s\n" "$FILE" >&2
  printf "%s\n" "$HITS" >&2
  printf "\nEvery image needs an alt — descriptive for content, alt=\"\" for purely decorative.\n" >&2
  printf "Override (rare, decorative + aria-hidden): tag the line '// allow-no-alt: <reason>'.\n" >&2
  exit 1
fi

exit 0
