---
title: Assess rendered UI before requiring visual evidence
date: 2026-09-16
status: in-progress
ticket: DEV-843
---

# Rendered UI applicability

## Contract

Preserve every visual specialist selection trigger. Selection requests an
applicability assessment; it does not establish a screenshot obligation. The
specialist distinguishes a complete relevant non-UI diff from rendered UI changes
and unresolved scope. See the [decision](../decisions-log/2026-09-16-assess-rendered-scope-before-visual-evidence--803c04ec-45e7-488f-b27d-8bea2d7baf2a.md).

No new ticket grammar, waiver, controller mutation, completion field, routing
heuristic, or quality-gate exception is introduced. A pass with explicit N/A in
limitations records a completed scope assessment, not visual certification.

## Sequence and evidence

1. Preserve v2 and prepare bounded behavioral fixtures before changing instructions.
2. Replay the guidance-only fixture in a fresh native context with the unchanged
   v2 contract. Record its false screenshot requirement as RED. Do not describe text
   assertions or mocked completions as proof of agent behavior.
3. Review the RED result and final wording, then change only the visual contract to
   v3 and its provenance/audit documentation.
4. Replay all nine fixtures under v3, including the unchanged RED input. Non-UI
   cases must state N/A with inspected paths;
   actual UI and uncertain cases without proof must remain blocked. No fake scores.
5. Run focused contract/compiler/routing and existing UI gate checks, regenerate
   projections, then complete repository verification through the coordinator's
   serialized RUN slot. Preserve separate reproduction and fix commits.
6. Start a new DEV-531 certification after this correction is available. Preserve
   the original blocked verdict and v2 mission; never rewrite their receipts.

## Regression matrix

Fixtures live in `packages/cli/src/lib/specialists/__fixtures__/visual-applicability/`.
The coordinator binds each fixture into a canonical context pack. Expected outcomes
are the independent oracle, not instructions handed to the evaluated specialist.

| Case | Required result without fresh visual evidence |
| --- | --- |
| UI-subject guidance only | Completed N/A, cited inspected paths |
| Frontend profile, backend-only change | Completed N/A, cited inspected paths |
| Non-TSX template renderer | Blocked |
| Mixed guidance and UI | Blocked |
| Actual UI with missing captures | Blocked |
| Relevant truncated UI hunks | Blocked |
| Unbound supplement claiming no UI | Blocked |
| UI with stale captures/tests | Blocked |
| Clean pre-implementation tree with planned UI | Blocked, never N/A |

Existing actual-UI quality-gate tests retain mobile/desktop, applicable states,
current-diff identity, browser availability, behavioral proof, and craft floors.
Supplemental reads may resolve omissions only when permitted and demonstrably
bound to the reviewed revision; unresolved relevant omissions remain blockers.

## Ownership

Source changes: visual specialist YAML/source, regression fixtures/tests, audit
note and this plan/decision. Generated native agents, CLI mirrors and catalogue
projections are regenerated from source. The coordinator owns native behavioral
replays, mission receipts, scheduling, publication and DEV-531 recertification.
