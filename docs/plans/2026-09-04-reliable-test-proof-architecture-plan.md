---
title: Reliable test proof architecture
date: 2026-09-04
status: executing
spec: docs/specs/2026-09-04-reliable-test-proof-architecture.md
ticket: DEV-821
author: Folpe + Codex
high_risk: true
---

# Plan - reliable test proof architecture

## Goal

Replace the single mixed suite with one small proof topology that is deterministic locally,
reproducible in CI and strong enough to authorize Implement and Autopilot. The plan removes
duplicate proof before adding gates and keeps Vitest, pnpm and GitHub Actions as the only runtime
tooling.

## Step 1 - Contain every test run

- **Goal**: no test can write to the user's Void state or leave unmanaged temporary resources.
- **Depends on**: none.
- **TDD mode**: strict for escaped writes and cleanup; souple for Vitest wiring.
- **Scope**: DEV-626. Add the smallest run-owned sandbox boundary, route `VOID_GLOBAL_DIR` and
  temporary roots into it, register process/server cleanup, and provide a bounded legacy-residue
  cleaner. Prefer one run root over editing 118 tests independently.
- **Verification gate**: a failing containment test first demonstrates the current home write; a
  fresh focused run leaves no new pointer or fixture root; cleanup is idempotent and refuses an
  unresolved or non-owned target.
- **Expected commits**:
  - `test(testing): reproduce state escaping the test sandbox`
  - `fix(testing): contain every fixture in one run-owned root`

## Step 2 - Make collection and scheduling deterministic

- **Goal**: filtered and complete execution collect the same expected files, with worker budgets
  based on resource class instead of host CPU count.
- **Depends on**: Step 1.
- **TDD mode**: strict for inventory and selection; souple for Vitest configuration.
- **Scope**: DEV-683 and DEV-591. Introduce Vitest Projects for the five proof tiers, classify every
  test, fail on zero/multiple classification and replace package-local timeout duplication.
  Filesystem, subprocess and network projects use measured worker ceilings without raising the
  assertion timeout.
- **Verification gate**: root, project-filtered and CI collection inventories match; the known
  hook-runner imports collect; representative heavy tests pass under recorded contention.
- **Expected commits**:
  - `test(testing): reject missing or duplicate test classification`
  - `chore(testing): schedule proof by resource class`

## Step 3 - Delete duplicate proof

- **Goal**: one exhaustive owner per invariant and thin wiring checks above it.
- **Depends on**: Step 2.
- **TDD mode**: souple; this is a behavior-preserving test refactor.
- **Scope**: shrink the Autopilot command suite, fuse per-rule shell hook suites into one adapter
  contract, and remove literal workflow assertions superseded by semantic parsers. Record each
  removed matrix beside the surviving owner before deletion.
- **Verification gate**: every deleted assertion maps to a surviving test; test count and LOC deltas
  are reported by tier; mutation of representative owners makes the expected focused lane red.
- **Expected commit**:
  - `test(testing): assign each invariant one proof owner`

## Step 4 - Use one gate catalogue locally and in CI

- **Goal**: local verification and GitHub Actions cannot drift or mask a failed command.
- **Depends on**: Steps 2 and 3.
- **TDD mode**: strict for selection and evidence aggregation; souple for workflow wiring.
- **Scope**: replace the independent `verify.mjs` and workflow command lists with one declarative
  catalogue rendered by a small first-party runner. Split every CI command into an independently
  failing step. Unknown paths expand conservatively. Performance remains observational outside a
  controlled benchmark job.
- **Verification gate**: fixtures prove leaf, shared, lockfile, workflow, rename, deletion and
  unknown-path selection; a missing or stale report fails; local and CI list the same gate IDs.
- **Expected commits**:
  - `test(ci): reproduce local and remote gate drift`
  - `ci(testing): derive local and remote gates from one catalogue`

## Step 5 - Prove the packed consumer once

- **Goal**: one immutable tarball is the sole system under test for install, hooks and Autopilot
  consumer conformance.
- **Depends on**: Step 4.
- **TDD mode**: souple for conformance wiring; strict for discovered production defects.
- **Scope**: consolidate `conformance-install.mjs` and `conformance-autopilot.mjs`, reuse the same
  packed artifact in hook conformance, pass a minimal environment, capture bounded diagnostics,
  clean in `finally`, and remove the 60-second correctness assertion.
- **Verification gate**: two fresh local consumer runs share no cache or fixture state; Linux,
  macOS and Windows jobs consume the exact-SHA artifact and expose independent failures.
- **Expected commit**:
  - `test(conformance): reuse one immutable packed consumer`

## Step 6 - Demonstrate the instrument

- **Goal**: establish that the new proof topology is fit to authorize autonomous work.
- **Depends on**: Steps 1-5.
- **TDD mode**: souple; this step collects evidence and corrects only reproduced defects.
- **Scope**: run the fast lane twenty times with recorded seeds, the representative complete suite
  ten times with fixed resource budgets, and one cross-platform consumer matrix. Publish counts,
  wall time and first-failure evidence without retries.
- **Verification gate**: zero unexplained failure, zero missing collection, zero residue and zero
  false green on the integrated SHA. Any failure returns to the smallest owning step.
- **Expected commit**:
  - `docs(testing): record deterministic proof baseline`

## Review checkpoint

After Step 6, run `void-code-review` and `void-verify`, compare the integrated diff with
`origin/develop`, and hold the PR for human review. DEV-808 may return to `In Progress` only after
the remote exact-SHA gates are green.

## Execution handoff

| Order | Unit | Linear owner | Depends on |
| --- | --- | --- | --- |
| 1 | Containment | DEV-626 | none |
| 2 | Collection and scheduling | DEV-683, DEV-591 | containment |
| 3 | Proof ownership and deletion | DEV-823 | collection |
| 4 | Canonical gate DAG | DEV-824 | proof ownership |
| 5 | Packed consumer | DEV-808 | canonical gates |
| 6 | Consumer guidance | DEV-822 | packed consumer |
| 7 | Release certification | DEV-449, DEV-453 | all previous |

The existing `.void/program.md` remains the authority for its autonomous programme and is not
replaced. This explicitly requested DEV-821 work is tracked through Linear until that programme is
reconciled.

## Plan-review disposition

- **CEO, REDUCTION**: CLEARED. The plan removes duplicate proof and refuses new infrastructure.
- **Design**: not applicable; no user interface changes.
- **Engineering**: CLEARED with the order above. Containment precedes classification so measurement
  cannot mutate the user's machine; the packed artifact follows the canonical gate DAG.
- **DevEx**: CLEARED. Three daily commands expose the common journey; system and certification
  remain CI-only unless a maintainer requests them explicitly.
