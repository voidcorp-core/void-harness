---
title: Test proof ownership record
date: 2026-09-04
status: complete
ticket: DEV-823
spec: docs/specs/2026-09-04-reliable-test-proof-architecture.md
---

# Test proof ownership record

This record names the surviving owner before duplicate proof is removed. The rule is simple: the
lowest faithful boundary owns the exhaustive matrix; a higher boundary proves only wiring,
serialization, side effects or integrated composition.

## Autopilot command boundary

`packages/cli/src/commands/autopilot.test.ts` previously repeated domain decisions for every
subcommand. Those matrices remain owned as follows:

| Command responsibility removed from the command suite | Exhaustive owner |
| --- | --- |
| Candidate selection and review budget | `cluster-plan.test.ts`, `review-budget.test.ts` |
| Programme consent and chain decisions | `program.test.ts`, `chain-step.test.ts`, `chain.test.ts` |
| Worker ordering, assignment and worktree commands | `worker-order.test.ts`, `orchestration-plan.test.ts`, `worktree-lifecycle.test.ts`, `footprint-area.test.ts` |
| Worker-result parsing, partial success and Git range validation | `worker-result.test.ts`, `partial-success.test.ts`, `git-observation.test.ts` |
| Footprint audit and reconciliation | `footprint-audit.test.ts`, `reconcile-plan.test.ts` |
| Verification and proof invalidation | `verification-plan.test.ts`, `required-proof.test.ts`, `proof-invalidation.test.ts` |
| Panel, review provenance and unit budget | `panel-proof.test.ts`, `review-provenance.test.ts`, `unit-budget.test.ts` |
| Publication, CI trigger accounting, PR body and progress | `publish-plan.test.ts`, `ci-trigger-plan.test.ts`, `pr-body.test.ts`, `run-progress.test.ts` |
| Union review, merge grant and observed landing | `union-review.test.ts`, `merge-plan.test.ts`, `remote-recovery.test.ts` |
| Base selection, protection and boundary interpretation | `base-selection.test.ts`, `branch-protection.test.ts`, `transition-oracle.test.ts` |
| Reservation and tracker lifecycle | `cluster-reservation.test.ts`, `tracker-lifecycle.test.ts` |
| State validation and atomic storage | `run-state.test.ts`, `state-store.test.ts`, `state-store.fault.test.ts` |
| Public cutover from the retired engine | `legacy-boundary.test.ts` |

The command suite keeps argv and stdin routing, JSON and human rendering, stable exit/error
mapping, and the one imperative effect it owns: creating the local cursor only after a proven
lease. `test/autopilot/autopilot-workflow.test.ts` remains the integrated owner for ordering and
stop behavior across the full cycle.

## Hook boundaries

| Removed duplicate | Surviving owner |
| --- | --- |
| Per-rule allow/refuse examples in each floor wrapper | `_checks.test.ts` owns the rule matrices; `floor-hooks.test.ts` now table-drives one refusal, one allowance and the two wrapper overrides. |
| Root `test/hooklib/hooklib.test.ts` | `packages/core/hooks/_hooklib.test.ts`, including scalar fallback, exact content, jq fail-closed behavior, physical path normalization and both runtime edit shapes. |
| Activation-meter examples in `test/primitive-hooks/primitive-hooks.test.ts` | `packages/core/hooks/activation-meter.test.ts`; the unique unwritable-root assertion moved there before deletion. |

`test/primitive-hooks/primitive-hooks.test.ts` keeps only distinct process contracts for
auto-format and the SessionStart output shape. Runtime manifest wiring remains owned by
`lifecycle-hooks.test.ts`.

## GitHub workflow boundaries

The removed `test/workflows/workflows-parse.test.ts` used indentation and substring heuristics.
`repository-workflows.test.ts` now owns strict YAML parsing for every YAML file under `.github`,
Bash and embedded Node syntax, parsed action pins, runner-context placement, effective OIDC
authority, the protected environment and the transitive `main` guard. Exact workflow presence is
already required by `verify.test.ts`, `release-authority.test.ts`, `decision-workflow.test.ts` and
`release-workflow.test.ts`, which open the named artifacts directly.

Release-specific supply-chain and operator invariants remain in `release-workflow.test.ts` and the
executable inline-script suites. They were not deleted because no lower semantic owner covers
them.

## Measured reduction

Measurements use Vitest 4.1.9 with one worker on the same Mac and no retry.

| Scope | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Audited test files | 10 | 8 | -2 |
| Audited test LOC | 2,366 | 893 | -1,473 (-62.3%) |
| Autopilot command assertions | 108 | 33 | -75 |
| Hook assertions | 102 | 96 | -6 |
| Workflow structure assertions | 52 | 20 | -32 |
| Total assertions in the audited scopes | 262 | 149 | -113 (-43.1%) |
| Summed Vitest test time | 4.65 s | 3.06 s | -1.59 s (-34.2%) |

The larger gain is maintenance surface rather than raw wall time: these files were not the
subprocess hotspot, but they forced one behavior change to be restated at several boundaries.
