---
date: 2026-07-10
title: "per-worker model tier in backlog-autopilot, driven by ticket stakes (DEV-404)"
---

## 2026-07-10: per-worker model tier in backlog-autopilot, driven by ticket stakes (DEV-404)

Follow-up to DEV-403 (the D+E lever). The backlog-autopilot Workflow spawned every worker on the inherited
session model. Now each **worker** is tiered by the ticket's stakes: a **light** ticket (low-risk,
high-confidence, non-sensitive footprint) runs its whole ticket-runner cycle on a cheaper model at medium
effort; anything high-stakes **or unknown** keeps the full-strength session model at high effort. The launcher
attaches the tier from its footprint estimate; the Workflow's `workerTier()` applies it.

Load-bearing choices:
- **Default is top-tier.** Absence of a tier signal → full strength, matching the existing "unknown footprint →
  conservative" routing. A bug in `workerTier` can only make a ticket *more* expensive, never cheaper — it fails
  in the safe direction, so there is no quality-loss path.
- **The predicate drives the tier.** The same footprint estimate that routes parallel-vs-sequential sets the
  tier, so a judgment-heavy ticket is never cheapened; sensitive areas (auth/security/migration/payment) force
  top-tier regardless of the other signals.
- **The reconcile subagent is never tiered down** — it merges branches, runs the full suite, and does the
  level-2 review (all judgment). Cheapening it would risk exactly the integration quality this skill exists for.
- **ticket-runner documents the pass→tier matrix** (mechanical = cheap, judgment = top-tier) and notes that
  interactively the cycle runs on the session model; the tiering is realized at the worker level.
- **No unit test for `workerTier`.** The Workflow scripts run in the Workflow runtime with injected globals
  (`agent`, `parallel`, `args`) and top-level side effects — they are not an importable, unit-tested boundary in
  this repo (no workflow has a test). The function is a small pure helper with a safe default; extracting it into
  a tested CLI lib the runtime cannot import would be over-engineering. The deterministic CLI core (partition,
  plan) stays the unit-tested boundary; this is orchestration prose-with-a-helper.

Why: the biggest frugality win is not spending the top model on a trivial CRUD ticket's whole cycle — but only
when "trivial" is *known*, and never for the passes or tickets where judgment is the point. Safe-by-default
tiering captures the win without a quality-loss path.
