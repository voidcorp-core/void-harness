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
The coordinator supplies each complete synthetic context in a fresh native evaluation,
with fixture and compiled-instruction hashes retained in a local evaluation manifest.
These evaluations do not create production mission certification. Expected outcomes
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

## Observed evidence and remaining handoff

- Reproduction commit `a0567f07` precedes fix commit `ec104bc6`. The native v2
  guidance-only replay returned `blocked` for missing captures despite acknowledging
  the complete prose-only diff. Mechanical RED was two expected failures of six tests.
- All nine v3 fixtures were evaluated in separate fresh native contexts using the
  compiled v3 instructions, with the expected oracle withheld. Guidance-only and
  profile-only backend changes returned `pass` with explicit N/A, inspected paths,
  and no visual-certification claim. The seven actual-UI or uncertain cases blocked.
- The existing completion parser accepted the actual v2/v3 outputs. A bounded local
  check verified distinct completion IDs, each supplied fixture against its committed
  input and manifest hash, and the compiled-instruction hash
  `55a1cedfaa7b2f9dbf0d0555a3127bb3906a60362824e42b3841cd0c81805fbc`.
  This is synthetic behavioral evaluation, not a production mission verdict.
- Focused routing, applicability and unchanged UI proof checks passed (20 tests),
  followed by compiler/projection checks (17 tests). CLI typecheck, changed-test lint,
  and normal commit hooks passed. The worktree doctor reported local shadow self-host
  `not-installed`; no installed-doctor success is claimed.
- Remaining: repository verification on the final clean commit, independent review,
  and coordinator-owned fresh DEV-531 certification after this correction is available.
  Historical v2 receipts remain unchanged.
- Package inspection measured 922,113 compressed bytes, above the prior 920,000-byte
  ceiling. The packed payload contains the canonical visual contract, provenance,
  native agent and generated catalogue, with no evaluation fixtures, tests, logs or
  local receipts. The coordinator approved the bounded ceiling increase to 930,000
  bytes. The previously reported base was rounded to 919.8 kB, so no exact growth
  delta is inferred from it. This adds only `scripts/check-package-size.mjs` to scope.
