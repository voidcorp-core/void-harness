---
title: Native Void Machine pivot
date: 2026-09-10
status: executing
spec: docs/specs/2026-09-10-native-void-machine-pivot.md
ticket: DEV-833
author: Folpe + Codex
high_risk: true
---

## Goal

Make the existing native execution path the executable project direction and
deliver VM-01 as a small, portable legacy consumer oracle. The work removes the
missing programme context before implementation and keeps the private value
campaign out of the delivery path. VM-01 through VM-06 are merged; the current
bounded slice is VM-07 / DEV-820.

## What already exists

The repository already provides the native runtime registry in
`packages/cli/src/lib/runtime-adapters.ts`, mission execution in
`packages/cli/src/commands/mission.ts`, deterministic autopilot decisions in
`packages/cli/src/commands/autopilot.ts`, and packed consumer probes in
`packages/cli/scripts/conformance-*.mjs`. This plan adds the missing portable
VM-01 contract around those surfaces; it does not replace them.

## Steps

### Step 1 — Reconcile the programme and tracker handoff

- **Goal**: point the active programme at versioned Void Machine documents and one real first unit, VM-01 / DEV-808.
- **Depends on**: none
- **TDD mode**: exploratory
- **Verification gate**: the programme frontmatter references this spec and plan; its order names DEV-808 as the first unit; the measurement branch is recorded as history and no campaign launch is performed.
- **Expected commits**:
  - `docs(machine): reconcile native programme context`
- **Notes**: preserve the campaign files as research history; do not delete evidence or mark a measurement complete. Tracker transitions are applied only after the native direction is recorded: DEV-833 closes as the completed direction decision, while DEV-838 through DEV-840 are canceled as an unadmitted measurement path.

### Step 2 — Freeze the portable VM-01 oracle

- **Goal**: add the versioned schema, manifest and redacted fixtures for the closed legacy-v3 scenario set under `conformance/machine/legacy-v3/`.
- **Depends on**: Step 1
- **TDD mode**: strict
- **Verification gate**: manifest/schema tests reject unknown scenarios, executable command fields, absolute paths, secrets, private source and malformed expected outcomes.
- **Expected commits**:
  - `test(machine): define legacy oracle refusal cases`
  - `feat(machine): add portable legacy consumer oracle`
- **Notes**: the oracle is declarative; trusted runners own command mappings and attestations.

### Step 3 — Connect packed conformance to the oracle

- **Goal**: make the existing packed consumer checks consume the portable oracle without importing production TypeScript into it.
- **Depends on**: Step 2
- **TDD mode**: souple
- **Verification gate**: one packed candidate is checked from an exact source SHA; success, corruption, unsupported receipt and preservation cases fail or pass with stable classifications and bounded evidence.
- **Expected commits**:
  - `test(machine): cover packed oracle conformance`
  - `feat(machine): run legacy consumer oracle`
- **Notes**: shell-free argv, zero retries, bounded output, redacted evidence, no lockfile or secret changes.

## Implementation Tasks from plan review

- **P1 — Programme transition**: update `.void/program.md` to this spec and
  plan, remove the obsolete campaign gate declarations, and make DEV-808 the
  sole first unit after the agreed tracker transition.
- **P2 — Oracle file contract**: name and test the exact `schema.json`,
  `manifest.json`, and scenario fixture files before wiring the runner.
- **P2 — Failure matrix**: keep explicit tests for happy, empty, malformed,
  stale, unsupported, unreadable, and upstream-process failure outcomes.

### Step 4 — Verify and hand off VM-01

- **Goal**: seal the candidate and hand DEV-808 to the normal review flow.
- **Depends on**: Step 3
- **TDD mode**: strict
- **Verification gate**: targeted tests, typecheck, build, relevant conformance checks, `void-harness doctor`, and the repository verification catalogue pass on the exact candidate commit.
- **Expected commits**:
  - `docs(machine): record VM-01 verification`
- **Notes**: promotion and merge remain human gates.

### Step 5 — Ship the native doctor compatibility slice (VM-02 / DEV-809)

- **Goal**: add the Rust workspace, versioned doctor report schema, read-only host inspection, and thin npm compatibility launcher.
- **Depends on**: DEV-808 merged
- **TDD mode**: strict for path/config/diagnostic decisions; souple for launcher wiring.
- **Verification gate**: Rust format, tests and clippy; packed launcher smoke; schema validation; package-size, typecheck, build and consumer conformance checks.
- **Expected commits**:
  - `test(machine): define native doctor contract`
  - `feat(machine): ship read-only native doctor`
  - `test(machine): exercise compatibility launcher`
- **Notes**: no writes, runtime/provider/tracker specificity in the kernel, no platform binaries bundled into the universal npm tarball, and no lockfile added.

### Step 6 — Validate one portable executable skill package (VM-03 / DEV-810)

- **Goal**: validate an inseparable `SKILL.md` plus `harness.yaml` package through a versioned native contract and expose `void-machine skill check <path> --json`.
- **Depends on**: DEV-809 merged
- **TDD mode**: strict for package parsing, canonical identity and refusal behavior; souple for CLI dispatch.
- **Verification gate**: schema and fixture tests, Rust format/tests/clippy, native skill check smoke, package typecheck/build and consumer conformance.
- **Expected commits**:
  - `test(machine): define portable skill package refusals`
  - `feat(machine): validate executable skill packages`
- **Notes**: exact bytes determine identity, unknown fields and unsafe capabilities fail fast, symlinks and path escapes are refused, and no package binaries or lockfiles are added to npm.

### Step 7 — Complete a durable no-effect run and proof (VM-04 / DEV-798)

- **Goal**: execute one validated read-only skill through a kernel-owned state machine and persist a canonical, crash-safe proof without an authoritative effect.
- **Depends on**: DEV-810 merged
- **TDD mode**: strict for transitions, persistence and crash recovery; exploratory only for the bounded adapter seam.
- **Verification gate**: versioned contracts, model tests, transaction-boundary crash injection, at least 1,000 seeded sequences, Rust checks, package tests and full repository verification.
- **Expected commits**:
  - `test(machine): define durable run transitions`
  - `feat(machine): persist no-effect run proofs`
- **Notes**: SQLite is an adapter behind a native port; the kernel stays free of runtime, provider, tracker, forge, language, framework and database specifics. A worker string never completes a run.

### Step 8 — Certify Claude Code subscription execution (VM-06 / DEV-812)

- **Goal**: certify the generic runtime-process port through the official non-bare `claude -p` path while preserving subscription billing and fail-closed policy.
- **Depends on**: DEV-798 and DEV-811 merged
- **TDD mode**: souple for process wiring; strict for auth, policy, parsing, timeout and cancellation.
- **Verification gate**: current official CLI documentation, refusal tests, a fresh authorized subscription run, redacted certificate, relevant Rust and Node gates, and full repository verification.
- **Expected commits**:
  - `test(runtime): define Claude subscription refusals`
  - `feat(runtime): certify Claude subscription execution`
- **Notes**: no token, raw environment, prompt or response is persisted; API and provider overrides are removed before launch; an adversarial sandbox escape degrades the platform to assisted-only.

## Review checkpoints

### Step 9 — Route deterministically, then rank semantically (VM-07 / DEV-820)

- **Goal**: implement the approved routing boundary where deterministic eligibility owns admission and semantic judgment may only rank eligible candidates.
- **Depends on**: DEV-813 and DEV-798 merged
- **TDD mode**: strict for eligibility, typed refusals, fallback and proof; souple for semantic process wiring.
- **Verification gate**: property tests, stable cross-platform fallback, immutable bounded ranking context, both certified runtime adapters, Rust and legacy compatibility gates, and full repository verification.
- **Expected commits**:
  - `test(routing): define deterministic eligibility refusals`
  - `feat(routing): rank only eligible routes`
- **Notes**: runtime and model details stay in adapters; invalid, absent or timed out semantic output falls back to deterministic order.

### Checkpoint A — after Step 1

Review the reconciled programme context before writing the oracle. The missing
Void Machine plan is restored and the campaign is explicitly outside delivery.

## Execution handoff

| Order | Unit | Dependency | Estimate | Human gate |
|---|---|---|---:|---|
| VM-01 | DEV-808 consumer contract oracle | DEV-833 decision, DEV-395, DEV-824 | L | no |
| VM-02 | DEV-809 native doctor compatibility slice | DEV-808 merged | L | no |
| VM-03 | DEV-810 portable executable skill package | DEV-809 merged | L | no |
| VM-04 | DEV-798 durable no-effect run and proof | DEV-810 merged | XL | no |
| VM-05 | DEV-811 Codex subscription execution | DEV-798 merged | L | no |
| VM-06 | DEV-812 Claude subscription execution | DEV-811 merged | L | no |
| VM-07 | DEV-820 deterministic eligibility and semantic ranking | DEV-813 and DEV-798 merged | L | no |

DEV-833 and DEV-838 remain tracker decisions/history around the abandoned
measurement path. DEV-839 and DEV-840 are not admitted by this plan. VM-01
through VM-06 are merged; DEV-820 is the current implementation handoff.
