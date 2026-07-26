---
schemaVersion: 1
id: "adr:7c2e470c-6891-42d8-a40a-9ab83bb35e86"
createdAt: "2026-07-26T10:23:37.415Z"
title: "Layer mission policies monotonically"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Layer mission policies monotonically

## Context

Mission planning composes policy from a certified core, stack profiles, an organization, and a
project. A conventional last-write-wins merge is convenient, but it lets a local file silently
remove a safety floor. Rejecting every override is safer but makes the extension seam unusable for
time-bounded compatibility work.

## Decision

Merge policy in the fixed order `core < profile < organization < project`, accept monotonic
strengthening directly, and require an explicit approved, reasoned, expiring waiver for every
weakening. Keep both conflicts and used waivers in the compiled result.

## Consequences

Positive:

- Safety regressions cannot hide behind precedence or file ordering.
- The same inputs produce the same merged policy and mission plan.
- Mission Control and verification can expose exactly which waiver changed the floor.

Negative:

- The policy schema needs semantic weakening checks in addition to structural validation.
- Organization and project owners must maintain waiver expiry instead of relying on a permanent
  override.

## Alternatives considered

- Last-write-wins was rejected because it makes a project typo capable of silently weakening core.
- Core-only immutable policy was rejected because legitimate organization and project additions
  would require forks.
- Arbitrary merge scripts were rejected because executable policy would break deterministic,
  account-free planning and expand the trust boundary.

## Reversal cost

Medium. The compiled schema is versioned, so a future strategy can ship as a new schema version,
but existing waivers and plan hashes need an explicit migration.
