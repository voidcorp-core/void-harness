#!/usr/bin/env bash
# autonomous-backlog.sh — opt-in Ralph-style loop that works a Linear backlog
# ticket by ticket, each ticket in a FRESH `claude -p` process (true context
# reset, the strongest anti-context-rot). State lives in Linear + a plan file on
# disk, never in conversation history. This is NOT a default harness behaviour;
# it runs only when a human launches it. See ../SKILL.md for the full doctrine,
# the HITL boundaries, and the blast-radius warnings.
#
# Usage:
#   bash autonomous-backlog.sh                 # supervised-autonomous (safe)
#   MAX_ITERATIONS=10 bash autonomous-backlog.sh
#   UNSAFE_FULL_AUTO=1 bash autonomous-backlog.sh   # only inside a sandbox
#
# Config (env, or .void/autonomous.json read with jq):
#   LINEAR_SCOPE     human description of the eligible view (team/project/cycle)
#   TARGET_STATE     Linear state that means "ready to work"  (default: Todo)
#   REVIEW_STATE     state to move a finished ticket to        (default: In Review)
#   BRANCH_PREFIX    per-ticket branch prefix                  (default: auto/)
#   MAX_ITERATIONS   hard cap on tickets this run              (default: 20)
#   MAX_FAILURES     consecutive ERRORs before circuit-break   (default: 2)
#   MODEL            model for the worker sessions             (default: unset = session default)
#   AUTO_MERGE       1 = merge PR after CI green + close ticket (default: 0, HITL at merge)
#   UNSAFE_FULL_AUTO 1 = pass --dangerously-skip-permissions   (default: 0; requires sandbox)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

die() { printf "autonomous-backlog: %s\n" "$1" >&2; exit 1; }

[[ -n "$ROOT" ]] || die "not inside a git repository."
command -v claude >/dev/null || die "the 'claude' CLI is not on PATH."
command -v jq >/dev/null || die "jq is required."

# Optional file config, overridden by any env var already set.
CONFIG="$ROOT/.void/autonomous.json"
get() { # get <json-key> <env-var> <default>
  local v="${!2:-}"
  if [[ -z "$v" && -f "$CONFIG" ]]; then v="$(jq -r --arg k "$1" '.[$k] // empty' "$CONFIG")"; fi
  printf "%s" "${v:-$3}"
}

LINEAR_SCOPE="$(get linearScope LINEAR_SCOPE 'the default Linear team backlog')"
TARGET_STATE="$(get targetState TARGET_STATE 'Todo')"
REVIEW_STATE="$(get reviewState REVIEW_STATE 'In Review')"
BRANCH_PREFIX="$(get branchPrefix BRANCH_PREFIX 'auto/')"
MAX_ITERATIONS="$(get maxIterations MAX_ITERATIONS 20)"
MAX_FAILURES="$(get maxFailures MAX_FAILURES 2)"
MODEL="$(get model MODEL '')"
AUTO_MERGE="$(get autoMerge AUTO_MERGE 0)"

# Safety pre-flight.
if ! git -C "$ROOT" diff --quiet || ! git -C "$ROOT" diff --cached --quiet; then
  die "working tree is dirty. Commit or stash before an autonomous run."
fi
# The security floor must NOT be disabled for an autonomous run.
[[ "${VOID_HARNESS_ALLOW_DANGEROUS:-}" == "1" ]] && die "refuse to run with VOID_HARNESS_ALLOW_DANGEROUS=1."
[[ "${VOID_HARNESS_ALLOW_SECRET_EDIT:-}" == "1" ]] && die "refuse to run with VOID_HARNESS_ALLOW_SECRET_EDIT=1."

CLAUDE_FLAGS=(-p --permission-mode acceptEdits --settings "$SCRIPT_DIR/settings.autonomous.json")
[[ -n "$MODEL" ]] && CLAUDE_FLAGS+=(--model "$MODEL")
if [[ "${UNSAFE_FULL_AUTO:-0}" == "1" ]]; then
  [[ -n "${VOID_SANDBOX:-}" ]] || die "UNSAFE_FULL_AUTO=1 requires VOID_SANDBOX to be set (run inside a disposable container)."
  printf "autonomous-backlog: WARNING — full-auto mode, permission prompts skipped. Blast radius is this sandbox.\n" >&2
  CLAUDE_FLAGS+=(--dangerously-skip-permissions)
fi

RUN_DIR="$ROOT/.void/autonomous-runs"
mkdir -p "$RUN_DIR"
LOG="$RUN_DIR/$(git -C "$ROOT" rev-parse --short HEAD)-$$.log"

log() { printf "[%s] %s\n" "$(date -u +%H:%M:%S 2>/dev/null || echo run)" "$1" | tee -a "$LOG" >&2; }

PROMPT_TEMPLATE="$SCRIPT_DIR/iteration-prompt.md"
# Bash parameter-expansion replacement, NOT sed: the config values are free text
# (LINEAR_SCOPE is a human description) and must not be interpreted. With sed,
# a value containing the delimiter (|), & or \N would corrupt or silently
# mis-substitute the template. ${tpl//'{{KEY}}'/$VALUE} treats VALUE literally.
render_prompt() {
  local tpl; tpl=$(cat "$PROMPT_TEMPLATE")
  tpl=${tpl//'{{LINEAR_SCOPE}}'/$LINEAR_SCOPE}
  tpl=${tpl//'{{TARGET_STATE}}'/$TARGET_STATE}
  tpl=${tpl//'{{REVIEW_STATE}}'/$REVIEW_STATE}
  tpl=${tpl//'{{BRANCH_PREFIX}}'/$BRANCH_PREFIX}
  tpl=${tpl//'{{AUTO_MERGE}}'/$AUTO_MERGE}
  printf '%s\n' "$tpl"
}

# Classify the worker's machine-readable last line.
# Protocol: the worker ends with `VOID_AUTONOMOUS_RESULT: <verb> [args]`.
classify() { grep -oE 'VOID_AUTONOMOUS_RESULT: [A-Z_]+' <<<"$1" | tail -1 | awk '{print $2}'; }

log "start: scope='$LINEAR_SCOPE' target='$TARGET_STATE' max_iter=$MAX_ITERATIONS max_fail=$MAX_FAILURES auto_merge=$AUTO_MERGE"

failures=0
completed=0
for ((i = 1; i <= MAX_ITERATIONS; i++)); do
  if ((failures >= MAX_FAILURES)); then
    log "circuit breaker: $failures consecutive failures. Stopping."
    break
  fi
  log "iteration $i/$MAX_ITERATIONS (fresh session)"
  OUT="$(render_prompt | claude "${CLAUDE_FLAGS[@]}" 2>>"$LOG" || true)"
  printf "%s\n" "$OUT" >>"$LOG"
  case "$(classify "$OUT")" in
    NO_TICKETS) log "backlog drained: no eligible '$TARGET_STATE' ticket left."; break ;;
    COMPLETED)  completed=$((completed + 1)); failures=0; log "ticket completed (total $completed)." ;;
    BLOCKED)    failures=0; log "ticket marked blocked by the worker; moved out of the queue. Continuing." ;;
    *)          failures=$((failures + 1)); log "no clear result (failure $failures/$MAX_FAILURES)." ;;
  esac
done

log "done: $completed ticket(s) completed this run. Log: $LOG"
printf "autonomous-backlog: %d completed. Review the open PRs before merging.\n" "$completed"
