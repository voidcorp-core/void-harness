#!/usr/bin/env bash
# Which areas of the tree a pull request touches, as step outputs.
#
# Used to skip work that cannot detect anything. The ProjectGraph kernel suite
# and its two benchmarks take 78s, 55s and 14s on every run, including runs that
# only edit documentation — they assert properties of code that did not change.
#
# THE DEFAULT IS TO RUN EVERYTHING. A push, a failed API call, an empty file
# list, or any event that is not a pull request all resolve to `true`. Skipping
# is an optimisation; running is the safe answer, so every uncertainty resolves
# to running. A filter that fails open would be a filter that silently stops
# testing.
#
# Files come from the pull request API rather than from git history, so the job
# needs no fetch depth beyond the default checkout.

set -uo pipefail

# Every area this script can report. Adding one means adding it here and to the
# classification below.
AREAS=(graph)

emit_all_true() {
  local reason="$1"
  printf 'changed-areas: running everything (%s)\n' "$reason"
  for area in "${AREAS[@]}"; do
    printf '%s=true\n' "$area" >>"$GITHUB_OUTPUT"
  done
  exit 0
}

[ -n "${GITHUB_OUTPUT:-}" ] || {
  printf 'changed-areas: GITHUB_OUTPUT is unset\n' >&2
  exit 1
}

[ "${GITHUB_EVENT_NAME:-}" = "pull_request" ] || emit_all_true "event is ${GITHUB_EVENT_NAME:-unknown}, not pull_request"

PR_NUMBER=$(jq -r '.pull_request.number // empty' "${GITHUB_EVENT_PATH:-/dev/null}" 2>/dev/null || true)
[ -n "$PR_NUMBER" ] || emit_all_true "no pull request number in the event payload"

FILES=$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files" --paginate --jq '.[].filename' 2>/dev/null) || {
  emit_all_true "the pull request files API call failed"
}
[ -n "$FILES" ] || emit_all_true "the pull request reported no changed files"

# The kernel and the package it resolves through a vitest alias and `noExternal`.
# A change to either can move what the kernel suite and its benchmarks observe.
if grep -qE '^packages/(harness-graph|mission-engine)/' <<<"$FILES"; then
  GRAPH=true
else
  GRAPH=false
fi

printf 'changed-areas: %s file(s) changed, graph=%s\n' "$(wc -l <<<"$FILES" | tr -d ' ')" "$GRAPH"
printf 'graph=%s\n' "$GRAPH" >>"$GITHUB_OUTPUT"
