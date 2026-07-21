---
date: 2026-07-10
title: "the live DX audit is a dedicated `devex-audit` skill, not an extension (DEV-398)"
---

## 2026-07-10: the live DX audit is a dedicated `devex-audit` skill, not an extension (DEV-398)

De-gstackification: the gstack coverage audit found `devex-review` (gstack's "Live Developer Experience Audit")
to be the one real coverage gap after waves 1-3. The DX *methodology* was already vendored, but only its
plan-time half — `plan-devex-review` → the DevEx lens of `plan-review` (TTHW target, journey, error paths,
docs, upgrade, as *plan requirements*). What was missing is the live application of that method to an existing,
deployed surface, exactly as `ui-review` audits a shipped UI versus `plan-review`'s Design lens judging the plan.

The ticket posed three options. Decision:

- **Option 1 — extend `ui-review` to also cover dev surfaces: REJECTED.** Two subjects in one skill (visual/
  interaction UI craft AND the developer journey: naming, errors, docs, upgrade). Violates anti-bloat rule 2
  (one skill = one subject) and rule 3 (> 30% overlap). Different audience, different evidence.
- **Option 3 — a "live" mode inside `plan-review`: REJECTED.** `plan-review` judges *written plans* before code;
  its own anti-rules forbid reviewing shipped code. A live audit is a different artifact at a different stage.
- **Option 2 — a dedicated `harness:devex-audit` (`on-demand`, floor/ceiling pattern): CHOSEN.** It mirrors the
  precedent already set by `ui-review`, which positions itself as the audit ceiling versus `plan-review`'s Design
  lens (the plan) and `frontend-design` (the build floor). The triangle here is `plan-review` DevEx lens (plan) /
  `api-and-interface-design` (build the contract) / `devex-audit` (audit the shipped contract).

Load-bearing choices:
- **The < 30% overlap is structural, not verbal.** vs the plan-review DevEx lens: same dimension names, but that
  lens states them as plan *promises* while this skill *measures* the shipped reality with an evidence tag
  (TESTED/PARTIAL/INFERRED) and a plan-vs-reality delta — opposite lifecycle stage, opposite epistemics. vs
  `ui-review`: different subject (visual craft vs developer journey). vs `api-and-interface-design`: build floor
  (design the contract) vs audit ceiling (judge it shipped).
- **Near-mechanical, decided in-cycle.** Because the `ui-review` precedent already settled this exact shape, the
  choice was made during the ticket rather than surfaced as an open taste decision — the ticket's recommendation
  (option 2) and the established pattern agreed.
- **Reject the gstack runtime, defer the browser.** Only the DX method is vendored (first principles, measured-TTHW
  tiers, gap-method scoring, six evidence-tagged passes). The gstack review-log/dashboard, `gstack-*` bins,
  external hall-of-fame file, and telemetry are rejected; the live browser driver defers to Vague 4, the same
  line `ui-review` holds. The skill stays valuable pre-Vague-4 because CLI/README/CHANGELOG/types are bash-testable
  today; only hosted-web surfaces defer.

Why: the DX capability needed a home, and the home had to respect the one-skill-one-subject floor. Bolting it onto
`ui-review` or `plan-review` would have blurred two audiences into one skill; a dedicated audit-ceiling skill keeps
each boundary sharp and reuses a pattern the codebase already proved with `ui-review`.
