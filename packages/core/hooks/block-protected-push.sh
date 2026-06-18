#!/usr/bin/env bash
# block-protected-push — l hook. Reads the agent's tool-call JSON from stdin and
# refuses any `git push` whose resolved target is a protected branch (main /
# master). This is a SECONDARY net, NOT the boundary: the real A1 boundary is
# server-side branch protection plus the orchestrator owning push + PR (the
# worker has no `git push` in its allowlist). A string-matching hook is
# bypassable by an agent with arbitrary code execution (node -e "git push ..."),
# so it backstops regressions; it does not stand alone. Runtime-agnostic: Claude
# "Bash" + Codex "shell" (string or argv array).
#
# Override (a deliberate, reviewed run that intends to push a protected branch):
# AUTO_MERGE=1. The orchestrator derives this from --auto-merge, never the
# ambient env (preflight fails on divergence). Exit codes: 0 allow, 2 block.

set -euo pipefail

INPUT=$(cat)
TOOL=$(printf "%s" "$INPUT" | jq -r '.tool_name // empty')
CMD=$(printf "%s" "$INPUT" | jq -r 'if (.tool_input.command? | type) == "array" then (.tool_input.command | join(" ")) else (.tool_input.command // empty) end' 2>/dev/null || true)

case "$TOOL" in Bash | shell) ;; *) exit 0 ;; esac
[[ -z "$CMD" ]] && exit 0
[[ "${AUTO_MERGE:-}" == "1" ]] && exit 0
printf "%s" "$CMD" | grep -qE '\bgit\b([^&|;]*\s)?push\b' || exit 0

block() {
  printf "block-protected-push: refusing a push to a protected branch (main/master).\n" >&2
  printf "Matched: %s\n" "$1" >&2
  printf "The orchestrator owns protected-branch pushes; AUTO_MERGE=1 to override.\n" >&2
  exit 2
}

is_protected() { case "$1" in main | master) return 0 ;; *) return 1 ;; esac; }

# Always-dangerous forms, independent of any refspec: --mirror / --all push every
# ref (main included); a `-c push.default=` override changes where a bare push
# lands. None are ever needed here.
printf "%s" "$CMD" | grep -qE '(^|[[:space:]])--mirror([[:space:]]|$)' && block "git push --mirror"
printf "%s" "$CMD" | grep -qE '(^|[[:space:]])--all([[:space:]]|$)' && block "git push --all"
printf "%s" "$CMD" | grep -qE 'push\.default' && block "git -c push.default override"

# Positional args after `push` (the remote, then refspecs), stopping at a shell
# chain operator so `git push && echo` is still seen as a bare push. Flags are
# dropped; `-c push.default=` sits before `push` so it is never captured here.
POSITIONALS=$(printf "%s" "$CMD" | awk '{
  seen = 0
  for (i = 1; i <= NF; i++) {
    if ($i == "push") { seen = 1; continue }
    if (!seen) continue
    if ($i == "&&" || $i == "||" || $i == ";" || $i == "|") break
    if ($i ~ /^-/) continue
    print $i
  }
}')

# Drop the remote (first positional); whatever remains are refspecs / branches.
REFSPECS=$(printf "%s\n" "$POSITIONALS" | sed '/^$/d' | tail -n +2)

if [[ -n "$REFSPECS" ]]; then
  # Explicit destination(s): block only if one resolves to a protected branch.
  while IFS= read -r r; do
    [[ -z "$r" ]] && continue
    dst="${r##*:}"            # part after the last colon (delete refspec ":main" → main)
    dst="${dst#refs/heads/}"  # normalise refs/heads/main → main
    is_protected "$dst" && block "explicit push to $dst"
  done <<<"$REFSPECS"
  exit 0
fi

# Bare push (no refspec): resolve the current branch + upstream in the cwd (the
# worker's worktree) and block if either is a protected branch.
CUR=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
UP=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || true)
is_protected "$CUR" && block "bare push on $CUR"
is_protected "${UP##*/}" && block "bare push tracking $UP"

exit 0
