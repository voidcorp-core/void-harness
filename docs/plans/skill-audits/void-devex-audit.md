---
skill: devex-audit
status: shipped
strategy: distill + re-home (plan-time → plan-review DevEx lens; audit-time → this skill)
target_loc: 400
actual_loc: 150
activation: on-demand
phase: E
depends_on: []
composes_with: [plan-review, api-and-interface-design, ui-review]
source_ticket: DEV-398
epic: DEV-383
audit_date: 2026-07-10
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `devex-audit`

## Need

The gstack coverage audit (2026-07-10) found `devex-review` (gstack "Live Developer Experience Audit") to be the **one real coverage gap** left after waves 1-3. The DX *methodology* was already vendored — but only the plan-time half: `plan-devex-review` → the DevEx lens of `harness:plan-review` (TTHW target, developer journey, error paths, docs, upgrade path, as *plan requirements*). What was missing is the **live application of that method to an existing, deployed surface** — exactly as `ui-review` audits a shipped UI versus `plan-review`'s Design lens judging the plan.

## Decision: a dedicated `devex-audit` (option 2), not an extension

The ticket posed three options. Decision and rationale (logged in `docs/DECISIONS.md` 2026-07-10):

- **Option 1 — extend `ui-review` to also cover dev surfaces: REJECTED.** It would put two subjects in one skill (visual/interaction UI craft AND the developer journey: naming, errors, docs, upgrade). Violates anti-bloat rule 2 (one skill = one subject) and rule 3 (> 30% responsibility overlap). The audiences and the evidence are different.
- **Option 3 — a "live" mode inside `plan-review`: REJECTED.** `plan-review` judges *written plans* before any code exists; a live surface audit is a different artifact at a different lifecycle stage. `plan-review`'s own anti-rules forbid it reviewing shipped code.
- **Option 2 — a dedicated `harness:devex-audit` (audit-time, `on-demand`), floor/ceiling pattern: CHOSEN.** This is the doctrinally-consistent choice: it mirrors the precedent already set by `ui-review`, which explicitly positions itself as the audit ceiling versus `plan-review`'s Design lens (the plan) and `frontend-design` (the build floor). Same shape here — the triangle is `plan-review` DevEx lens (plan) / `api-and-interface-design` (build the contract) / `devex-audit` (audit the shipped contract). The choice was near-mechanical given that precedent, so it was made in-cycle rather than surfaced as an open taste decision.

## How the < 30% overlap is held

Structural, not by wording:
- **vs `plan-review` DevEx lens** — that lens states the dimensions as *plan requirements* (does the plan promise a TTHW target, name the error paths?). This skill *measures the shipped reality* with an evidence tag (TESTED/PARTIAL/INFERRED) and a plan-vs-reality delta. Same dimension names, opposite lifecycle stage and opposite epistemics (promise vs measurement).
- **vs `ui-review`** — different subject entirely (visual/interaction craft vs developer journey). No shared dimensions.
- **vs `api-and-interface-design`** — that is the build floor (design a minimal, stable, versioned contract). This is the audit ceiling (judge the contract's shipped DX). Build vs judge.

## Distilled vs rejected

See `.source` for the full matrix. Kept: DX first principles, measured-TTHW tiers, the gap-method rubric, the six evidence-tagged passes, the TESTED/PARTIAL/INFERRED discipline, the plan-vs-reality boomerang concept. Rejected: the entire gstack runtime (review-log/dashboard, `gstack-*` bins, external hall-of-fame file, telemetry, plan-mode plumbing). Deferred to Vague 4: the live browser driver (hosted docs/playground/signup/error-page screenshotting), same deferral line as `ui-review`.

## Why the skill is valuable before Vague 4

A large part of a dev surface is bash/file-testable *today*: CLI `--help` ergonomics, README step count, install command, error output on bad input, `CHANGELOG`/migration quality, TS types + LSP, CI config, docs-as-code findability. Only the hosted-web surfaces defer. The skill states this scope split explicitly ("testable now vs Vague 4") so an audit run is honest about its evidence rather than blocked entirely.

## Open follow-ups

- When Vague 4 lands the claude-in-chrome re-point, wire the deferred live checks (playground, signup flow, 404 pages) — same follow-up ui-review carries.
- Consider a shared "gap-method scoring + evidence-tag" micro-convention if a third audit skill appears (ui-review, devex-audit already share the shape); today two is not enough to factor (YAGNI).
