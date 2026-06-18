---
skill: backlog-batch
status: draft
strategy: original
target_loc: 200
matrix_row: plans/skill-decision-matrix.md#backlog-batch
audit_date: 2026-06-18
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `backlog-batch`

## What it is

The attended, parallel sibling of `autonomous-backlog-loop`. The human is present and
wants a handful of **independent** Linear tickets done **now, in parallel, without
breakage**, returned as **one PR**. Each ticket is worked by a worktree-isolated subagent;
the green branches are reconciled into a single integration PR gated by the full suite.

Spec `docs/specs/2026-06-18-backlog-batch-parallel.md`, plan
`plans/2026-06-18-backlog-batch-parallel-plan.md`.

## Adaptation strategy

**`original`** — assembled from the Workflow substrate (deterministic multi-agent
orchestration with per-agent worktree isolation), native git worktrees, the Ralph
deterministic-backpressure principle, and the harness craftsman cycle. No single source
ships an attended, risk-routed, parallel ticket drain reconciled into one integration PR.

## What we keep

- Deterministic orchestrator (Workflow JS), not a long LLM session. Source: Ralph "thin
  orchestrator", the Workflow tool.
- Fresh context per unit of work — here a worktree subagent, not a process. Source: Ralph/GSD.
- Tests are the only judge — the full suite gates the integration PR. Source: Ralph.
- HITL at the edges — human confirms the plan, owns the merge. Source: harness doctrine.

## What we adapt

- **Process → subagent.** The loop's per-ticket fresh `claude -p` process becomes a
  worktree-isolated subagent. Why: tool/MCP inheritance, subscription billing inherited (no
  API-key strip), native observability — at the cost of a shared process (acceptable for an
  attended burst, not for a 20-ticket walk-away run).
- **Sequential → risk-routed parallel.** Instead of one ticket at a time, estimate file
  footprints and run the genuinely-disjoint, low-risk ones concurrently; sequence overlap /
  lockfile / migrations. The estimate is speculative, so the reconciliation subagent + full
  suite are the backstop.
- **One PR per ticket → one integration PR per batch.** A single review for the burst; the
  reconciliation subagent merges and the full suite judges.

## What we reject

- Blind parallelism (N agents on one working tree) — corrupts state.
- An LLM session as orchestrator — context rot + non-deterministic loop control.
- Clever graph-coloring of the overlap set — YAGNI; the conservative "parallel only if
  isolated" rule is correct and cheap, with the suite as backstop.
- A combined live smoke on void-harness itself — worktree isolation targets the current
  repo; the live multi-agent smoke is a consumer-project dogfood (decision 2026-06-18).

## Boundary vs `autonomous-backlog-loop` (anti-bloat rule 3)

Distinct subjects, < 30 % overlap. Shared: Linear selection vocabulary, the craftsman
worker cycle. Different: orchestration (CLI process vs Workflow subagent), risk model
(sequential vs risk-routed parallel), output (PR/ticket vs integration PR/batch),
attendance (walk-away vs attended). The boundary table is restated in both SKILL.md.

## Verification checklist for shipping this skill

- [x] SKILL.md ≤ 400 LOC
- [x] Frontmatter `description` ≤ 200 chars
- [x] `.source` lists every audited source
- [x] Deterministic core unit-tested in the CLI (`selectIndependent`, `partition`, `buildPlan`)
- [x] Matrix row added in `plans/skill-decision-matrix.md#backlog-batch`
- [x] No overlap > 30 % with `autonomous-backlog-loop` (boundary table in both)
- [ ] Live multi-agent dogfood in a consumer project (deferred — worktree isolation targets cwd)
- [ ] Status moved draft → reviewed after user review

## Open questions

- Footprint estimator: keep the per-ticket LLM pass, or learn footprints from merged-PR
  history once there is data? LLM pass for now.
- Concurrency cap vs test-isolation: should the launcher auto-detect port/DB-bound test
  suites and lower `--max-parallel`? Manual for now.
