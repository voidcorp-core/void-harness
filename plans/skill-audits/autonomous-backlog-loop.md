---
skill: autonomous-backlog-loop
status: draft
strategy: original
target_loc: 220
matrix_row: plans/skill-decision-matrix.md#autonomous-backlog-loop
audit_date: 2026-06-04
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `autonomous-backlog-loop`

## Need

A team with a curated Linear backlog wants to launch an unattended run that
implements ticket after ticket overnight, with the same craftsman discipline a
human session would apply, and without the blast radius of an unsupervised
`--dangerously-skip-permissions` loop. Without this skill, "autonomous mode" would
either not exist or be reinvented per project as an unsafe bash loop. The skill
codifies a HITL-safe orchestration that drains the backlog while keeping the human
in control of the two edges that matter: what gets worked (backlog curation) and
what gets merged (PR review).

## Decision matrix anchor

- **Wins**: an explicitly launched run that implements a curated Linear backlog,
  one fresh session per ticket.
- **Loses to**: every normal interactive session (this is never a default). Human
  judgment on scope (backlog) and merge (PR) always wins.
- **Cannot decide**: whether a ticket's scope is right (the human-approved criteria
  are the spec); whether to merge to a protected branch (human, unless AUTO_MERGE=1).
- **Composes with**: the full craftsman cycle skills, invoked inside each session.

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| ghuntley "ralph" | https://ghuntley.com/ralph/ | read | principles kept, unsupervised loop rejected |
| shanraisshan ralph-wiggum loop | https://github.com/shanraisshan/ralph-wiggum-self-evolving-loop | read | orchestrator/fresh-context pattern kept |
| get-shit-done | https://github.com/gsd-build/get-shit-done | read | anti-context-rot (fresh per task, state on disk) kept; namespace rejected |
| Claude Code best practices | https://code.claude.com/docs/en/best-practices | read | runnable-check loop, Stop hook, scoped allowlist, `claude -p` kept |

## Adaptation strategy

**`original`** — assembled from the Ralph principles + the harness craftsman cycle +
the harness security hooks. No single source ships a HITL-safe, Linear-driven loop.

## What we keep

- Fresh context per unit of work (new process per ticket). Source: Ralph, GSD.
- Disposable-but-persistent plan on disk. Source: Ralph.
- Deterministic backpressure (tests decide). Source: Ralph, Claude Code best practices.
- Scoped `--allowedTools` / settings allowlist for unattended runs. Source: best practices.
- Don't-assume-not-implemented. Source: Ralph.

## What we adapt

- **Human gate placement**: changed from "gate every action" (naive HITL) to "gate
  the boundaries" (backlog curation + PR merge). Why: per-action prompts defeat
  autonomy; per-boundary gates preserve control where it is irreversible.
- **State store**: changed from a local `IMPLEMENTATION_PLAN.md` to Linear (ticket
  state) + per-ticket on-disk plan. Why: the backlog already is the durable queue.

## What we reject

- **Unsupervised `while :; do ... --dangerously-skip-permissions; done`**: rejected
  as a default. Why: no floor, no review, antithesis of HITL-absolute. Offered only
  behind `UNSAFE_FULL_AUTO=1` + a required `VOID_SANDBOX` marker.
- **Auto-merge by default**: rejected. Why: review is where correctness is owned;
  default to PRs, opt in to auto-merge for low-stakes work with trustworthy CI.
- **Self-judging completion**: rejected. Why: the model's self-report is not a gate;
  the test suite is.

## Hard rules surfaced by this skill

- **Never a default.** Enforced by: only `scripts/autonomous-backlog.sh` triggers it.
- **Security floor stays on.** Enforced by: orchestrator refuses to start with
  `VOID_HARNESS_ALLOW_*` set; security hooks gate every run.
- **Green-or-blocked, never half.** Enforced by: SKILL.md + the iteration prompt's
  verification step; a red ticket is blocked with evidence, not closed.
- **Sandbox for full-auto.** Enforced by: `UNSAFE_FULL_AUTO=1` requires `VOID_SANDBOX`.

## Companion artifacts

- `scripts/autonomous-backlog.sh` — the orchestrator (loop, circuit breakers, fresh
  process per ticket, deterministic gate, logging).
- `scripts/iteration-prompt.md` — the per-ticket worker prompt.
- `scripts/settings.autonomous.json` — the scoped permission profile.
- `scripts/stop-verification-gate.sh` — opt-in Stop hook (turn-level backpressure).

## Anti-rules (what this skill MUST NOT do)

- MUST NOT run unprompted or as a default.
- MUST NOT merge to a protected branch without explicit AUTO_MERGE + green CI.
- MUST NOT close a red ticket, invent acceptance criteria, or disable the hooks.

## Verification checklist for shipping this skill

- [x] SKILL.md ≤ 400 LOC (199)
- [x] Frontmatter `description` ≤ 200 chars
- [x] `.source` lists every audited source with URL
- [x] Companion scripts syntax-check; settings JSON valid
- [x] Matrix row added in `plans/skill-decision-matrix.md#autonomous-backlog-loop`
- [x] Orchestrator integration test (NO_TICKETS drain, dirty-tree refusal, circuit breaker)
- [x] No overlap > 30% (it orchestrates other skills; it does not duplicate them)
- [ ] Sister-doc parity: AGENTS.md mention matches CLAUDE.md
- [ ] Status moved draft → reviewed after user review

## Open questions

- Should a `npx @voidcorp/harness autonomous` CLI wrapper become the ergonomic entry
  point (vs invoking the script from the plugin dir)? Likely yes; follow-up.
- Linear ordering: rely on the worker session to rank, or query Linear ordering
  deterministically in the orchestrator? Currently the worker ranks.
