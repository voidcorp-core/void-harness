---
title: Native Void Machine pivot
date: 2026-09-10
status: approved
author: Folpe + Codex
ticket: DEV-833
related:
  - ../VOID-MACHINE-VISION.md
  - ../specs/2026-08-31-autonomous-until-develop.md
  - ../plans/2026-08-31-autonomous-until-develop-plan.md
---

# Native Void Machine pivot

## Decision

The project continues through the existing native `void-implement`,
`void-autopilot`, mission, and runtime-adapter paths. The private autonomous
value campaign is research evidence only and stays out of the delivery path.
No second runtime, paid campaign launcher, or parallel orchestration layer is
added to make the campaign appear executable.

## First slice

Restore an executable Void Machine programme context from the versioned vision
and existing repository capabilities. VM-01 froze the observable consumer
contract in a portable, redacted legacy oracle. VM-02 shipped one read-only
native doctor through a thin compatibility boundary. VM-03 validated one
executable skill package through a versioned native contract. VM-04 established
durable no-effect proof and VM-05 certified the Codex subscription adapter.
VM-06 is now the current slice: certify the same generic runtime-process port
through the official Claude Code subscription CLI. The work preserves current
consumer behavior, does not perform the native cutover, change permissions, or
publish an artifact.

## Boundaries

- Linear owns mutable ticket state and dependencies.
- The repository owns the vision, spec, plan, oracle schema, and fixtures.
- Existing runtime adapters own runtime-specific discovery and invocation.
- The deterministic kernel owns mission state, limits, evidence, recovery, and
  external-effect decisions.
- Missing runtime or authorization capability remains an explicit blocker.

## Acceptance

- The active programme references files that exist in the checkout and names
  one executable first unit.
- VM-01 has a versioned portable oracle and schema with no executable commands,
  secrets, private source, machine paths, or lockfiles.
- A packed artifact can be checked against the oracle without importing
  production TypeScript into the oracle.
- The native doctor reports a schema-valid result without writing project state.
- `void-machine skill check <path> --json` validates an inseparable `SKILL.md`
  and `harness.yaml` package, rejects unsafe or ambiguous inputs before
  execution, and derives identity from exact bytes in path order.
- A no-effect run persists state, append-only events, outbox intents, leases,
  budgets and proof atomically through a bounded SQLite adapter, fences stale
  supervisors, and resumes deterministically after seeded crash injection.
- Corrupt, unsupported, unreadable, or ambiguous evidence fails fast and
  preserves the prior state.
- Existing native mission and autopilot behavior remains unchanged outside the
  bounded compatibility slices.
- Targeted tests, typecheck, build, and the relevant full verification gates
  pass on the exact candidate commit.

## Explicit non-goals

- Launching DEV-839 or any paid evaluation campaign.
- Claiming that the harness improves agent quality from local tests alone.
- Replacing the existing runtime CLIs or their native session continuity.
- Rewriting the repository around a new orchestration engine.

## TDD and verification

Use strict TDD for oracle parsing, validation, and refusal behavior. Use a
small fixture-driven conformance lane for packed consumer behavior. Fail fast
on missing artifacts, stale SHAs, unsupported scenarios, and non-redacted
evidence. Run the repository's normal verification catalogue at the end.
