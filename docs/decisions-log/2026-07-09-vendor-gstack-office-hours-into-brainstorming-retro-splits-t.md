---
date: 2026-07-09
title: "vendor gstack /office-hours INTO brainstorming; retro splits to its own ticket (DEV-386)"
---

## 2026-07-09: vendor gstack /office-hours INTO brainstorming; retro splits to its own ticket (DEV-386)

De-gstackification Vague 1 (epic DEV-383). DEV-386 was scoped to fold both `retro` and `office-hours` into
existing skills. On execution the two halves diverged, so the ticket was split.

**office-hours → brainstorming (this PR).** The YC product diagnostic is vendored as an upstream
"Pressure-testing a raw idea" mode: the six forcing questions (demand reality, status quo, desperate
specificity, narrowest wedge, observation & surprise, future-fit) with stage routing, the anti-sycophancy
posture, and — per an explicit ask — the **10x ambition move** (drop self-imposed constraints, carry an
ideal + creative-lateral path into the approaches; YAGNI prunes down from an ambitious set, never starts
timid). Folded rather than kept as a separate skill because the input ("I have an idea") and the outcome (an
approved design spec) are one continuous flow; brainstorming already delegated upstream to office-hours, so
absorbing it removes a soon-dead hop. Rejected: builder-mode visual/design-discovery (forge/design waves),
cross-model Codex second opinion (separate /challenge initiative), gstack runtime plumbing. The adversarial
posture is scoped to the upstream mode; the normal design flow keeps its collaborative voice (198 → 217 LOC).

**retro → its own ticket, NOT folded.** The ticket mapped retro → `compounding`, but `compounding` no longer
exists (fused into `learning-capture`, issue #75), and retro (a periodic *window* review) is a different
subject from learning-capture (a *point* capture of one lesson) — folding would violate one-skill-one-subject
and overflow the 400-line cap. Decision (Folpe): a light dedicated `harness:retrospective` skill, dropping
gstack's quantified-self gamification (focus score, ship of the week, streaks) and reading git log / PRs /
`.void/usage.log` instead of `~/.gstack/`, feeding `learning-capture` for the durable patterns. Tracked
separately so the clean office-hours half is not blocked behind the retro scope call.

Why: office-hours' idea-pressure-test is durable craftsman value that belongs at the front of the design flow;
retro's durable kernel is real but distinct and partly gamification, so it earns its own skill and its own
scoping decision rather than a forced fold.
