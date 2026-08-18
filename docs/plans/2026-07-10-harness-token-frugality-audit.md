# Harness token-frugality audit (DEV-403)

Directive: the whole harness should consume the least tokens possible with **zero quality loss**.
This audit measures where the tokens actually go, corrects the ticket's initial framing, and proposes
a HITL decision list. Nothing here is applied without Folpe's sign-off.

## Finding 1 — `activation: always` is NOT a content loader (corrects the ticket's lead lever)

The ticket led with "activation audit: flip `always` → `on-demand` to load fewer descriptions". **This
saves nothing.** The `activation` frontmatter is read only by the **graph cost/behavior model**
(`activation-meter`, `rollup`, `audit`, `graph` commands) — see DECISIONS 2026-07-04. No hook or plugin
mechanism injects the full SKILL.md of an `always` skill into the session. Skill loading is Claude Code's
standard plugin behavior: **descriptions** load for routing; **full content loads on invocation**.

Consequence: flipping the 17 `always` flags would (a) save zero session tokens and (b) corrupt the graph's
liveness model (it would flag those skills as on-demand and mis-score their cost). **Do not touch activation
flags for frugality.**

## Finding 2 — the static/session footprint is already lean

- **SessionStart hook** injects ~4 lines (the floor reminder). Negligible.
- **Per-call hooks** (`activation-meter`, `outcome-meter`) `printf` to **log files** and emit **zero** model
  context (`# NEVER output`). No per-turn token cost.
- **Agents already partly tiered**: code-explorer / doctrine-critic / silent-failure-hunter = **sonnet**;
  migration-planner / type-design-analyzer = **opus**.

The genuinely-always cost is: ~65 skill **descriptions** (≤ 200 chars each, capped) loaded for routing, plus
CLAUDE.md / AGENTS.md / MEMORY.md at session start. Modest, and already governed by `claude-md-authoring` +
the 200-char cap.

## Finding 3 — the real cost is WORK, and the lever is model tiering

The dominant token cost is execution: every ticket-runner pass, every subagent, every backlog-autopilot
worker runs on a model. This is where frugality pays, without touching any skill's prose or a pass predicate.

## Proposed decisions (each gated "zero quality loss" — HITL)

| # | Change | Quality argument | Recommend |
|---|--------|------------------|-----------|
| A | `type-design-analyzer` opus → sonnet | Type-shape analysis is pattern-matching, not deep reasoning; doctrine-critic already runs sonnet well. | Yes (try, revert if evals dip) |
| B | Keep `migration-planner` on opus | Migration sequencing is high-stakes reasoning; a wrong plan is expensive. | Keep |
| C | Pin backlog-autopilot **estimator** subagent to haiku explicitly (skill says "a cheap model is fine" but doesn't pin) | Footprint estimation is a cheap classification; low confidence already routes safe. | Yes |
| D | Add a **per-pass model tier** convention to ticket-runner: mechanical passes (mirror/artifact regen, ingest gate) MAY run a cheaper model; keep top-tier for architecture / security-deep / review-judge / verification-adjudication / brainstorm | Only mechanical passes tier down; every judgment pass stays top-tier — no quality loss by construction. | Design + HITL |
| E | backlog-autopilot **workers**: the workflow `agent()` sets `opts.effort`/`opts.model` per pass so a trivial ticket's cycle runs cheaper than a high-stakes one (triage already classifies). | The predicate already knows which passes fired; tiering follows the predicate, not a guess. | Design + HITL |
| F | Description/doc tightness sweep | Distill over-long descriptions; **never** amputate load-bearing prose. Marginal win. | Low priority |

Rejected: flipping `activation` flags (Finding 1); cutting any pass or predicate (directive forbids).

## Verification of "zero quality loss"

For each applied change, the gate is the **behavioral eval-harness** (DEV-394) on the affected skill/agent
where it applies, plus a revert path. Model downgrades (A, C) are the easiest to A/B; the tiering conventions
(D, E) are prose that the human validates before the next autopilot run.

## Decision (Folpe, 2026-07-10)

Selected **A, C, F**. Not D+E.

- **A — applied**: `type-design-analyzer` opus → sonnet.
- **C — applied**: backlog-autopilot estimator pinned to haiku ("low confidence already routes safe").
- **B — kept**: `migration-planner` stays opus (no-op).
- **D+E — filed as a follow-up ticket**: the per-pass model-tier mechanism (ticket-runner passes +
  backlog-autopilot workers via `agent()` `opts.model`/`opts.effort`) is a design increment with its own tests.
- **F — pursued as a dedicated, eval-gated pass, NOT a rushed end-of-session sweep**: distilling doctrine-skill
  prose "without amputating load-bearing content" requires the behavioral eval-harness (DEV-394) to prove zero
  loss per skill. A blind sweep would risk exactly the quality loss the directive forbids, so F runs as a
  careful per-skill pass (longest first: tdd 369L, functional 313L, llm-cost-discipline 300L, typescript-strict
  297L, domain-driven-design 293L), each change eval-verified. Tracked, not rushed.

Applied changes (A, C) are reversible; if any behavioral eval dips, revert the single frontmatter line.
