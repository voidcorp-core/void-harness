---
schemaVersion: 1
id: "adr:e492e50e-86b0-4427-9fdf-2435750ce60d"
createdAt: "2026-09-19T16:07:43.608Z"
title: "Port Void Machine capabilities to strict TypeScript with explicit layer ownership"
status: proposed
deciders: ["folpe"]
supersedes: ["adr:873d1c5a-ef12-44c7-84dd-2fcd853b7ab8"]
---

# Port Void Machine capabilities to strict TypeScript with explicit layer ownership

## Context

Folpe decided to port the existing Void Machine capabilities to strict TypeScript
on Node.js on 2026-09-19. Maintainability by the project owner is a major criterion.
The reported read-only inventory at 1efeedf1 contains eight Rust files, about
1,542 non-test lines, 451 test lines and 28 declared tests. This is an inventory,
not functional certification. No measured need currently justifies two languages.

## Decision

Port implemented capabilities with explicit core, runtime, development-vertical
and adapter ownership. Product parity does not mean retaining Git or skill policy
inside the generic core. Finish WORK-1/2/3 before isolated port implementation.

The binding scope and acceptance are in
[the bounded port specification](../specs/2026-09-19-void-machine-typescript-port.md).
It replaces the previous Rust-continuation direction, while retaining the rejection
of automatic harness-control inheritance. Historical decisions remain unchanged.
The future complete mission journey is a separate subsequent delivery.

Use standard hashing and JSON primitives and maintained format parsers. Preserve
required public contracts, byte identities, numeric semantics, security refusals
and effect semantics. Existing defects are not compatibility obligations: explain
and test necessary corrections without expanding scope. Each responsibility has
one authoritative owner; specialized layers depend on generic contracts.

## Consequences

Positive:

- One implementation language supports owner maintenance and simpler operations.
- Software policy stays out of the general mission engine.

Negative:

- Porting requires contract evidence, consumer checks and careful numeric/byte handling.
- No performance improvement follows from language choice alone; measure verification cost.

Remove replaced Rust/build paths from the candidate only after parity and consumer
verification. Do not maintain two engines permanently. Implementation and isolated
verification are authorized; release and active-install replacement are not.

## Alternatives considered

- **Continue Rust plus TypeScript:** rejected because no measured need offsets the
  owner's maintenance burden for the inventoried scope.
- **Literal transliteration into a monolithic core:** rejected because Git merge,
  worktree and skill policies belong to the development vertical and adapters.
- **Build the whole future engine during the port:** rejected as an unbounded scope
  increase; the accepted full journey follows the parity milestone.

## Reversal cost

Medium: restore the prior candidate from Git and reconcile any changed public data
contracts explicitly. Preserve history and proofs; never reset live state or silently
replace an active installation. This record remains proposed until repository merge.
