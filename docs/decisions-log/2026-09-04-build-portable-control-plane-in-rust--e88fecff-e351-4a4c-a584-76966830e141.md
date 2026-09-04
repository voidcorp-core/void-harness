---
schemaVersion: 1
id: "adr:e88fecff-e351-4a4c-a584-76966830e141"
createdAt: "2026-09-04T10:06:08.784Z"
title: "Build the portable control plane in Rust"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Build the portable control plane in Rust

## Context

Consumer execution must be independent of Node.js, survive process crashes, enforce exhaustive
state transitions and ship as a small cross-platform artifact. Node single-executable applications
and the built-in SQLite module are not yet stable enough to be the reliability foundation. The
team must nevertheless understand the system without Rust-specific cleverness.

## Decision

Implement the portable control plane in stable Rust edition 2024 behind versioned JSON contracts.

Authored crates forbid unsafe code. Production code avoids panic-driven control flow, keeps the
crate count small, represents state with closed enums and exposes narrow ports. TypeScript remains
build-time tooling and legacy compatibility only; it is not a second production kernel.

## Consequences

Positive:

- One native artifact, exhaustive state modeling and explicit ownership support the reliability
  target without requiring a consumer runtime.
- Rust's compiler and type system make invalid transitions and unhandled outcomes harder to ship.

Negative:

- Contributors need Rust tooling and review discipline while the team builds fluency.
- Some audited dependencies contain unsafe FFI even though authored code does not.
- Cross-platform release and debugging infrastructure must mature alongside the kernel.

## Alternatives considered

- **Node.js and TypeScript**: strongest current team familiarity, but rejected for the kernel because
  native packaging and embedded SQLite remain moving foundations and consumers retain Node coupling.
- **Go**: a credible native alternative with simpler onboarding, rejected because the approved model
  benefits more from exhaustive state types and Rust's compile-time ownership guarantees.
- **Rust core with TypeScript orchestration**: rejected because two production authorities recreate
  the split-brain boundary the migration is intended to remove.

## Reversal cost

**High.** Reimplementation would touch every adapter and operational tool. Portable contracts and
conformance fixtures reduce the cost, but do not make a kernel-language migration small.
