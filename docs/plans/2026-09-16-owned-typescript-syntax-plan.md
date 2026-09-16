---
title: Deliver isolated official TypeScript syntax inspection
date: 2026-09-16
status: executing
spec: docs/specs/2026-09-16-owned-typescript-syntax.md
ticket: ""
author: folpe + Codex
high_risk: true
---

# Goal

Replace the rejected Babel implementation in PR #386 with the harness-owned
TypeScript 6 API, explicit policy/adapter/process/distribution boundaries and
measured performance. The user approved execution of this design and its
performance gate; no further selection from the unrelated programme is needed.

## Steps

### 1. Prove ordinary-worker feasibility

- Depends on: none.
- TDD mode: exploratory for disposable /private/tmp measurement scripts only.
- Pin @typescript/typescript6 in packages/hook-runner/package.json using pnpm.
- Measure fresh process startup, module load, parse, syntactic diagnostics and
  traversal on the real Cortex PostgreSQL test and bounded synthetic inputs.
- Gate: no deadline increase; report all samples and p50/p95/p99, memory.
- Expected commit: docs/build evidence only; throwaway code never shipped.

### 2. Inspect proposed source through the owned worker

- Depends on: 1.
- TDD mode: strict.
- Files: hook-runner enforcement syntax-analysis, syntax-inspection and their
  tests; new syntax protocol/policy/worker modules; hook-runner build scripts.
- Preserve real semantic and hostile-consumer tests. Add worker-artifact,
  protocol, failure and dependency-boundary regressions before implementation.
- Gate: observed RED, then complete enforcement suite and package typecheck.
- Expected commits: test(hooks) regression then fix(hooks) owned TS worker.

### 3. Deliver paired assets through every supported surface

- Depends on: 2.
- TDD mode: strict.
- Files: CLI codex-floor, runtime-assets/adapters, plugin-cache, self-host
  compile/doctor and tests; core assets/mirror; verify artifact catalogue.
- Extend existing inventories and transactions; missing/incompatible worker
  refuses; offline packed install and update/rollback cover both runtimes.
- Gate: native install/doctor/self-host/packed tests plus deterministic rebuild.
- Expected commits: test(cli) paired-delivery regression then fix(cli) delivery.

### 4. Measure and review the shipped correction

- Depends on: 3.
- TDD mode: strict for any correction; benchmark glue covered by actual runs.
- Files: hook-runner benchmark, CI supported-OS evidence, architecture/evidence
  docs and proposed ADR, actual tarball size ceiling only after measurement.
- Gate: full pnpm typecheck/test, targeted lint (existing nested-worktree global
  lint obstruction disclosed), hook benchmarks, worker distribution benchmarks,
  exact artifact parity, real Cortex read-only dogfood and independent review.
- Expected commit: fix/docs/perf according to any final measured correction.
- Replace PR386 body with final TS design/evidence. No merge or npm release.

## Review checkpoints

Report feasibility measurements before completing delivery. Escalate a measured
incompatibility with fixed budgets; do not replace the parser or add a daemon.
Independent architecture/security/QA review before updating the PR. Native
review evidence is not canonical mission certification.

## Resume point

Next: step 1. Approved design; production sources still contain rejected Babel
implementation. Source-floor and Cortex installations remain untouched.
