---
name: plan-review
activation: on-demand
description: Critique a written plan (not a diff) via four lenses: CEO premise/ambition, Eng test-coverage, Design states/slop, DevEx time-to-first-value. Proposes findings; the author disposes.
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: active
    codex: active
    hermes: ci-only
---

# plan-review — voidcorp craftsman edition

`brainstorming` pressure-tests the idea and `writing-plans` authors the plan. This skill sits between the written plan and implementation: it **critiques an already-written plan** from up to four expert lenses, surfaces findings one decision at a time, and appends an Implementation Tasks list to the plan. It is read-mostly — it **proposes**; the plan's author (you, via `writing-plans`) **disposes**. It never writes code and never restructures the plan itself.

Invoke it on a plan in `docs/specs/` or `plans/` before the plan becomes tickets. Pick one lens, several, or `all` (the orchestrated pass, below).

**Attribution**: see `.source`. Distilled from gstack `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/plan-devex-review`, `/autoplan` (methodology only; the runtime and the named-founder rosters are rejected).

---

## The shared contract (every lens obeys this)

- **Scope gate first.** Before reviewing, state what the plan touches and what is explicitly NOT in scope. A plan touching > 8 files or > 2 new services is a size smell — flag it before anything else.
- **One finding = one decision.** Surface findings interactively, one at a time, each as a concrete decision with 2-3 options (always including "do nothing / defer") and a recommendation mapped to a stated preference. Never dump a wall of findings.
- **Severity**: `P1` blocks ship · `P2` same-branch follow-up · `P3` later. Effort is dual-scaled (human hours vs AI-agent minutes — completeness is cheap when an agent implements).
- **Findings become tasks, not edits.** The lens appends an Implementation Tasks list (P1/P2/P3) to the plan. It does not silently rewrite the plan; the author folds the fixes in. Registries the plan should already contain (Not-in-scope, What-already-exists, diagrams) are `writing-plans`' job — the lens flags their absence, it does not own them.
- **Verdict**: `CLEARED` (no P1 unresolved) or `NOT CLEARED` with the blocking findings named.
- **Optional second opinion.** For a high-stakes plan, run one independent pass (a fresh subagent, or a second model) and surface only where it disagrees — cross-model tension is signal.

---

## Lens: CEO — is this the right thing, at the right ambition?

The only lens that may challenge the **premise** and say "scrap it, do this instead." It accepts nothing as given.

- **Premise & leverage**: right problem? a cheaper reframing? real outcome vs a proxy metric? cost of doing nothing? what existing code already solves each sub-problem?
- **Trajectory**: current → delta → 12-month ideal. Reversibility 1-5 (one-way vs two-way door); path dependency; debt introduced; "obvious to a new engineer in 12 months?"
- **Alternatives are mandatory**: 2-3 approaches, weighting *minimal-viable* and *ideal-architecture* equally, each with effort/risk/reuse; recommend one; do not proceed without approval. (Authoring the chosen approach is `writing-plans`' job — the lens forces the comparison, not the write-up.)

**Scope mode** (pick once, up front — this is the plan-level 10x move):
- `EXPANSION` — cathedral: run the 10x check, sketch the Platonic-ideal version, name ≥ 5 delight opportunities. Default for greenfield.
- `SELECTIVE` — hold rigor as the baseline, then offer neutral expansion candidates + platform potential to cherry-pick. Default for an enhancement.
- `HOLD` — maximum rigor, no expansion; > 8 files / > 2 services is a smell. Default for a bugfix.
- `REDUCTION` — ruthless minimum. Default for a > 15-file plan.

**Verdict shape**: CRITICAL GAP / WARNING / OK per area, plus the unresolved decisions.

---

## Lens: Eng — is this buildable, testable, and will it not break?

The gating lens. Owns the deep **test-coverage trace** no other lens does. Four sections, each answered even when "no issues":

- **Architecture**: boundaries and dependency direction, coupling / SPOFs, scaling, security architecture, the distribution/build pipeline, and one realistic production-failure scenario per new codepath.
- **Failure modes**: every codepath walked for four data paths — happy / nil / empty / upstream-error. A failure that is neither rescued nor tested is a CRITICAL GAP.
- **Tests**: detect the framework; trace every branch, error, and null path; map interaction edge cases (double-submit, navigate-away, stale data, slow network, concurrency); decide unit vs E2E vs eval per behavior. **A regression fix ships with a test — non-negotiable.** Emit a coverage map of what is and isn't covered.
- **Performance**: N+1, unbounded memory, missing caching on hot paths.

**Output**: per-finding `[severity] (confidence N/10) file:line`, and quote the line that motivates each finding (no quote → it is unverified, drop the confidence). Verdict CLEARED / NOT CLEARED gates the plan.

---

## Lens: Design — what does the user perceive on screen?

Scope-gated: no UI in the plan → skip. Judges what reaches the user's eyes.

- **Information architecture**: explicit primary / secondary / tertiary emphasis per screen.
- **Interaction-state coverage**: every state the user actually hits — loading, empty, error, success, partial — described as what the user *sees*. A missing state is a first-class plan gap, not a detail.
- **Journey & emotional arc**: the 5-second / 5-minute / 5-year read of the feature.
- **AI-slop risk**: classify the surface (marketing vs app-UI vs hybrid) and hold it to the matching bar; reject generic-AI-generated patterns. (Bar and blacklist re-derived from OpenAI's "designing delightful frontends" + Krug — cited in `.source`, composes with `harness:frontend-design` / `harness:ui-review`.)
- **Responsive & a11y**: per-viewport intent, keyboard path, ARIA, 44px targets, 4.5:1 contrast — as plan requirements, not afterthoughts.

**Output**: rate each dimension `N/10 → M/10` with the fix written into the plan; "design-complete" when every dimension ≥ 8.

---

## Lens: DevEx — is the developer-facing surface a good journey?

Scope-gated: no API / CLI / SDK / library / docs surface → skip. Audits the developer journey from "never heard of it" → hello-world → upgrade. Signature metric: **time-to-first-value (TTHW)**, scored against real competitors (verify with a web search, do not invent numbers).

- **Getting started**: one-command install, try-before-install, steps to a working example.
- **Interface design**: guessable naming, sensible defaults, coverage vs dropping to raw HTTP, progressive disclosure.
- **Error messages**: trace three real error paths — each names the problem, the cause, the fix, and links docs.
- **Docs**: findable in 2 minutes, copy-paste works, version-matched.
- **Upgrade path**: blast radius, deprecation warnings, codemods, semver honored.
- **Dev environment**: LSP autocomplete, non-interactive CI, types, hot reload, cross-platform.

**Output**: a DX scorecard (each dimension Score/Prior/Trend + TTHW tier + competitive rank); TTHW > 10 min is blocking; any dimension < 6 is critical DX debt. This lens judges the *plan's promises*; once the surface ships, `harness:devex-audit` measures the reality against them.

---

## `all` — the orchestrated pass (replaces gstack autoplan)

Runs the applicable lenses in the fixed order **CEO → Design → Eng → DX** (Design/DX skipped when their scope gate is empty). The order is load-bearing: each phase completes and writes its findings before the next. autoplan is a **mode here, not a separate skill** — once the lenses are one skill, an orchestrator that "runs the four" is a mode, not a new subject (YAGNI).

Between phases, auto-decide only the safe class; escalate the rest:
- **Decision taxonomy**: *Mechanical* (one correct answer) → auto-decide. *Taste* (defensible either way) and *User-challenge* (contradicts a stated goal) → surface to the human, never auto-decide.
- **Decision principles** for the Mechanical class: choose completeness; fix the whole blast radius (auto-approve in-radius expansions under ~1 day / 5 files / no new infra); when two fixes are equivalent, take the cleaner one without agonizing; reject duplication, reuse; explicit-and-graspable beats clever; bias toward flagging over blocking.
- **Cross-lens synthesis**: a concern raised by 2+ lenses is a high-confidence theme (the dedup that makes the multi-lens pass worth more than four solo runs).
- **One final gate**: present the aggregated, deduped task list and the auto-decision audit trail; the human approves / overrides / challenges / revises-and-re-runs the affected lens. The pass drives to this gate; it never auto-applies plan edits beyond appending the task list.

---

## Composition & boundaries

- **Downstream of `writing-plans`** (which authors the plan) and **upstream of implementation** (`ticket-runner`). It reviews the artifact `writing-plans` produced.
- **Not `brainstorming`**: brainstorming pressure-tests the *idea* (is there demand?); plan-review critiques the *written plan* (is it the right shape, buildable, complete?). Different artifact, different question.
- **Not `code-review`**: that reviews a *diff*; this reviews a *plan* before any code exists.
- **Not `doctrine-critic`**: that judges a diff against VoidCorp doctrine; this critiques a plan across product/eng/design/DX lenses.
- **Composes with `frontend-design` / `harness:ui-review`** (the Design lens defers UI build-craft and audit to them), `harness:devex-audit` (the DevEx lens's shipped-surface counterpart — this judges the plan, that measures the deployed reality), and `security-guidance` / `harness:security-audit` (the Eng lens routes a deep security concern there).

---

## Anti-rules

- MUST NOT rewrite the plan — it appends a findings/task list; the author folds fixes in.
- MUST NOT own plan structure or registries (Not-in-scope, diagrams) — that is `writing-plans`.
- MUST NOT re-litigate the idea's demand — that is `brainstorming`.
- MUST NOT review code or a diff — that is `code-review`.
- MUST NOT auto-decide a Taste or User-challenge call — those go to the human.
- MUST NOT dump findings in bulk — one finding, one decision.
- MUST NOT vendor the gstack runtime or the named-founder "how great X think" rosters.

---

## Final rule

```
Written plan → pick lens(es) → one finding at a time → Implementation Tasks appended → CLEARED verdict.
The lens proposes; the author disposes. Otherwise → it is not voidcorp plan-review.
```

A plan reviewed by the right lens before it becomes tickets is cheaper by an order of magnitude than the same gap found in code review.
