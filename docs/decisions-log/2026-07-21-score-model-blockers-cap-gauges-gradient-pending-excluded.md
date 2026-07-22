---
date: 2026-07-21
title: "the health score caps on blocker failure-predicates, not low scores; unmeasured dimensions are pending, not zero"
---

## 2026-07-21: the health score caps on blocker failure-predicates, not low scores; unmeasured dimensions are pending, not zero

Phase B step B2 scores `ProjectState` into eight dimensions (spec §6, Fork 6). Three non-obvious calls:

**Blocker cap fires on a red *predicate*, not a low score.** A dimension is a `blocker` (installation,
enforcement, governance) or a `gauge` (portability, activation, efficacy, performance, dx). A blocker
caps the global at 69 **only when its `red` failure-predicate is true** — a genuine defect (e.g. a
capability with no owner) — never merely because its score is low. This is what lets Hermes' `ci-only`
enforcement score ~60 without capping the project: a structural ceiling is not a failure. The credible
alternative (cap when any blocker dimension scores below a threshold) was rejected: it would punish the
harness for a runtime's structural limits and conflate "new/limited" with "broken". Gauges are maturity
gradients — they lower the mean proportionally and can never cap, so a fresh install reads as new, not
broken.

**Unmeasured dimensions are pending (excluded), not invented.** A dimension with no honest local
signal — no data yet (installation's transactional signal lands with `void init` in Phase C; dx has no
deterministic local measure) or nothing to measure (an empty project, denominator 0) — carries an
explicit pending marker and is **excluded from the global mean**, not scored 0. The alternative
(defaulting to 0 or a plausible placeholder like the spec mockup's 74) was rejected: a false 0 makes a
brand-new project read identically to a failing one, and an invented number erodes the credibility the
five-state model rests on. This is the same "0 effective is the truth" stance as the certification
manifest — the score reports only what it can honestly measure, and the confidence band carries the
rest. Confidence requires a real sample floor (not a single capability hammered N times) before it
rises above `low`.

**Next actions derive from the measured gauges, not a hand-list.** The impact-ranked action list is
computed from gauge dimensions below 100 (a red blocker already surfaces via `blockers`; a pending
dimension has no measurable gap), so a future measurable gauge joins the list without a code change —
no maintenance trap.

Why: a score that can be gamed by a flattering average, or that invents numbers for what it cannot
measure, is worse than no score. Capping on real defects, excluding the unmeasured, and deriving
actions from real gaps keeps the top-5% bar honest — the score never masks a blocker and never claims
proof it lacks.
