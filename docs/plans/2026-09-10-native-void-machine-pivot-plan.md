---
title: Native Void Machine pivot
date: 2026-09-10
status: in-progress
spec: docs/specs/2026-09-10-native-void-machine-pivot.md
ticket: DEV-833
author: Folpe + Codex
high_risk: true
---

## Goal

Make the existing native execution path the executable project direction and
deliver VM-01 as a small, portable legacy consumer oracle. The work removes the
missing programme context before implementation and keeps the private value
campaign out of the delivery path.

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

## Review checkpoints

### Checkpoint A — after Step 1

Review the reconciled programme context before writing the oracle. The missing
Void Machine plan is restored and the campaign is explicitly outside delivery.

## Execution handoff

| Order | Unit | Dependency | Estimate | Human gate |
|---|---|---|---:|---|
| VM-01 | DEV-808 consumer contract oracle | DEV-833 decision, DEV-395, DEV-824 | L | no |

DEV-833 and DEV-838 remain tracker decisions/history around the abandoned
measurement path. DEV-839 and DEV-840 are not admitted by this plan.
