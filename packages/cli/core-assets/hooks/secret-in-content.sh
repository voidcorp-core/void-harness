#!/usr/bin/env bash
# secret-in-content — PreToolUse hook (Edit|Write). Reads Claude Code JSON from
# stdin. Blocks writing a HIGH-CONFIDENCE secret into ANY file — the companion to
# protect-sensitive-files, which only guards known secret FILENAMES. A key pasted
# into a normal source file would otherwise pass silently.
#
# Scope: the edit's new content only (bounded — never scans the repo; that is
# gitleaks/CI). POSIX ERE only (no grep -P, #64). Exit codes: 0 allow, 2 block.

set -euo pipefail
source "${BASH_SOURCE[0]%/*}/_hooklib.sh"

hooklib_read
TOOL=$(hooklib_tool)
FILE=$(hooklib_file)

case "$TOOL" in Edit|Write) ;; *) exit 0 ;; esac
[[ -z "$FILE" ]] && exit 0
# Test fixtures legitimately hold fake secrets; the doctrine allows them.
[[ "$FILE" =~ \.(test|spec)\.|/__tests__/|/__fixtures__/|/fixtures/|/__generated__/ ]] && exit 0
hooklib_require_jq secret-in-content
NEW=$(hooklib_content)
[[ -z "$NEW" ]] && exit 0

# High-confidence vendor tokens: each prefix is specific enough for ~zero FP.
re_hi='AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}'                                  # AWS
re_hi="$re_hi"'|gh[posru]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}'    # GitHub
re_hi="$re_hi"'|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}'         # Stripe
re_hi="$re_hi"'|sk-ant-[A-Za-z0-9_-]{40,}|sk-proj-[A-Za-z0-9_-]{40,}'      # Anthropic/OpenAI
re_hi="$re_hi"'|sk-[A-Za-z0-9]{40,}|xox[baprs]-[A-Za-z0-9-]{10,}'          # OpenAI/Slack
re_hi="$re_hi"'|AIza[0-9A-Za-z_-]{35}'                                     # Google API
re_hi="$re_hi"'|-----BEGIN [A-Z ]*PRIVATE KEY-----'                        # PEM

report() {
  printf "secret-in-content: a likely secret was detected in %s\n%s\n\n" "$FILE" "$1" >&2
  printf "Never commit secrets to source. Use an env var (.env, ignored) + @repo/core/env.\n" >&2
  printf "False positive (a fixture / placeholder)? tag the line '// allow-secret-pattern: <reason>'.\n" >&2
  exit 2
}

HI=$(printf "%s" "$NEW" | grep -nE "$re_hi" | grep -vE 'allow-secret-pattern:' || true)
[[ -n "$HI" ]] && report "$HI"

# Generic: a secret-named var assigned a long, mixed, non-placeholder literal.
# Guarded against the documented false positives (UUID, pure-hex git hash, short
# base64, obvious placeholders). Per-line so exclusions apply to the value.
re_assign='(_KEY|_SECRET|_TOKEN|_PASSWORD|_PASSWD|_APIKEY)["'\'' ]*[:=][ ]*["'\'']([A-Za-z0-9+/=_-]{24,})["'\'']'
while IFS= read -r line; do
  printf "%s" "$line" | grep -qE 'allow-secret-pattern:' && continue
  printf "%s" "$line" | grep -qiE "$re_assign" || continue
  val=$(printf "%s" "$line" | sed -E "s/.*[:=][ ]*[\"']([A-Za-z0-9+\/=_-]{24,})[\"'].*/\1/")
  printf "%s" "$line" | grep -qiE 'process\.env|import\.meta\.env|xxx|changeme|example|redacted|your[-_]|<[a-z]|placeholder|todo' && continue
  [[ "$val" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] && continue
  [[ "$val" =~ ^[0-9a-fA-F]+$ ]] && continue
  printf "%s" "$val" | grep -qE '[A-Za-z]' && printf "%s" "$val" | grep -qE '[0-9]' || continue
  report "$line"
done < <(printf "%s" "$NEW")

exit 0
