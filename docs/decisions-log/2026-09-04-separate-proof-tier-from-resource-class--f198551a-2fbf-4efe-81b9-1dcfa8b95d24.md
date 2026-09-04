---
schemaVersion: 1
id: "adr:f198551a-2fbf-4efe-81b9-1dcfa8b95d24"
createdAt: "2026-09-04T17:40:00.000Z"
title: "Separate proof tier from resource class"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# Separate proof tier from resource class

## Context

The root Vitest suite runs pure models, filesystem fixtures, nested child processes and local HTTP
servers with one timeout and one default worker policy. Seventy-three subprocess or network files
consumed about 91.5% of measured summed file time, while repeated runs left thousands of fixture
directories and tens of thousands of pointers in the user's Void state.

The suite is both a developer feedback loop and an authorization instrument for Implement and
Autopilot. A faster laptop or larger runner changes latency, but cannot make undeclared inputs,
duplicate proof or leaked state deterministic.

## Decision

Every test declares one proof tier and one resource class. Proof tier answers what the evidence
means; resource class answers how it may run. Vitest Projects provide the native execution
boundary, and one first-party catalogue drives local commands and GitHub Actions.

The Mac runs fast and bounded component feedback. Immutable consumer, system and certification
proof runs on ephemeral CI workers with explicit resource budgets. A complete integrated-SHA run
remains required before an autonomous merge because independently green branches can contradict
each other after composition.

One invariant has one exhaustive owner. Higher tiers prove wiring only and duplicate assertions
are deleted after their owner is identified.

## Consequences

Positive:

- Machine speed no longer determines whether a correctness assertion passes.
- Expensive files cannot oversubscribe the host merely because more cores are visible.
- Local and CI selection share one authority.
- Removing duplicate proof reduces maintenance and the number of flaky surfaces.

Negative:

- Every existing test must be classified once during migration.
- Maintainers must understand the distinction between semantic proof and resource scheduling.
- Full certification feedback arrives later than the local fast loop.

## Alternatives considered

- **Run the unchanged suite on a larger Mac or larger GitHub runner.** Rejected because it hides
  oversubscription and leaves state leakage, duplicate proof and environment contamination intact.
- **Adopt Bazel, Nx or Nix now.** Rejected because native Vitest Projects and GitHub matrices cover
  the measured need without another task graph or cache authority.
- **Keep one suite and lower global parallelism.** Rejected because it slows pure tests, still mixes
  incompatible resources and does not identify what each test proves.

## Reversal cost

Medium. The tests remain ordinary Vitest files, so the projects and catalogue can be collapsed.
Restoring one mixed suite would lose classification and CI routing but require no product migration.

