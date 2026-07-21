---
date: 2026-07-10
title: "fold ship / spec / investigate into existing skills — vendor the DELTA, document the rest (DEV-388)"
---

## 2026-07-10: fold ship / spec / investigate into existing skills — vendor the DELTA, document the rest (DEV-388)

De-gstackification Vague 2 (epic DEV-383). Three high-value gstack skills whose harness equivalents already
exist: `/ship`, `/spec` (5-phase intent→spec engine), `/investigate`. Decision: NO new skills — enrich the
existing targets with only the load-bearing delta each source adds, and document what is already covered or
rejected. This is the anti-bloat-correct move: creating ship/spec/investigate skills would duplicate
ticket-runner / brainstorming+writing-plans / systematic-debugging by 70-90%.

- **`/ship` → ticket-runner + verification-before-completion.** ticket-runner gains the cycle-level disciplines
  (Test-Failure-Ownership triage, the independent fresh-context adversarial review pass, bisectable commit
  ordering); verification-before-completion gains the Plan-Completion Audit (DONE/PARTIAL/UNVERIFIABLE + honesty
  rule + per-item confirm) and the named-excuse rationalizations. Rejected: the Review-Army roster (over-
  engineered release-gate apparatus — kept only its idea), and VERSION/CHANGELOG (release-please owns it).
- **`/spec` → brainstorming + writing-plans.** brainstorming gains the precision half (read-code-before-asking
  with `path:line`, the five "why" questions gate, quantify-everything, failure-mode axis); writing-plans gains
  the executability gate (unfamiliar implementer executes with zero follow-up) + MVP-cut-first. /spec's
  single-solution persona was NOT allowed to overwrite brainstorming's 2-3-approaches divergence.
- **`/investigate` → systematic-debugging.** ~85-90% already covered (shared superpowers lineage). A documented-
  rejection case: folded only the surgical deltas (pattern-lookup table, 3-strike rule, blast-radius gate,
  instrument-to-confirm, recurring-bug smell, red-flags); the phase skeleton + Iron Law were deliberately not
  re-vendored.

Each affected skill's audit note carries the full covered/integrated/rejected diff. No skill exceeded 400 LOC
after enrichment (largest: writing-plans 230). No new routing surface — the folds enrich, they do not move
boundaries.

Why: these three carry real methodology (a red-suite adjudication, a plan-completion honesty audit, evidence-
grounded interrogation, a diagnostic pattern table) that the harness skills lacked in specifics. Folding the
delta captures it without the 3-new-skills bloat, and keeps each skill one-subject.
