---
date: 2026-07-10
title: "de-couple /benchmark, /benchmark-models, /claude-api — neither vendor nor keep-external (DEV-401)"
---

## 2026-07-10: de-couple /benchmark, /benchmark-models, /claude-api — neither vendor nor keep-external (DEV-401)

Third and last teardown-unblocking ticket. The remaining live gstack compositions were: `/benchmark` (perf
budget in `accessibility-first`, `frontend-design`, `code-review`), `/benchmark-models` (model choice in
`llm-cost-discipline`), and `gstack:/claude-api` (SDK mechanics in `llm-cost-discipline`).

The ticket framed this as "vendor vs KEEP-EXTERNAL (ADR)". A **third option was taken: de-couple.** These were
all *optional escalation / measurement references*, not capabilities the harness itself provides:
- **`/claude-api` → the native `claude-api` skill** (a real Claude Code skill; the `gstack:` prefix was simply
  wrong). Trivial repoint.
- **`/benchmark` → the project's own perf tooling** (Lighthouse CI, WebPageTest, bundlesize). The perf budget
  (LCP < 2.5s) and the "measure, don't guess" rule are preserved; they just no longer name gstack's tool.
- **`/benchmark-models` → a generic instruction** ("benchmark the candidate models on the actual prompts —
  cost + quality"). The escalation methodology is preserved without gstack's specific command.

Rejected: **vendoring** a perf-regression or model-benchmark skill (over-scoping — building a skill to replace an
optional reference adds surface for no new capability) and a **keep-external ADR** (would keep a live gstack
dependency alive for no reason — the whole point is to reach zero). De-couple is the minimal correct answer:
zero capability lost, zero new surface, zero remaining gstack dependency.

**State after this ticket: the harness has ZERO live gstack compositions.** Every remaining `gstack` mention in a
core skill is historical attribution ("vendored from", "distilled from", "Supersedes") — justified by the teardown
AC, not a dependency. The teardown (DEV-395) is now unblocked; DEV-399/400/401 are all merged.

Why: a budget you measure with Lighthouse and a "which model?" you settle by running the prompt never needed a
gstack command — only a habit of naming one. Removing the names removes the last teardown blocker.
