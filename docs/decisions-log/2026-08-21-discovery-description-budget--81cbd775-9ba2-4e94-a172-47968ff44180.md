---
schemaVersion: 1
id: "adr:81cbd775-9ba2-4e94-a172-47968ff44180"
createdAt: "2026-08-21T10:40:59.490Z"
title: "Adopter un budget à deux niveaux pour les descriptions de découverte"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Adopter un budget à deux niveaux pour les descriptions de découverte

## Context

`description` is the portable discovery surface for a skill and the delegation
surface for an agent. The repository documents a 200-character cap, while the
global gate has enforced 512 since 2026-08-19. That split lets CI approve a
state the doctrine calls blocking.

The published Agent Skills specification permits 1,024 characters and asks the
description to state both what a skill does and when it applies. Claude Code
likewise uses an agent's description to decide when to delegate. The current
catalogue contains 90 source descriptions, averages 174 characters, has two
above 200, one above 250, and none above 500.

## Decision

Skills and agents use a 250-character editorial target and a 500-character hard
cap; descriptions between 251 and 500 are allowed but reported, and must spend
the extra budget on discovery signal rather than procedure.

A useful description names the user's intent, when the component should be
selected, and, where an adjacent component could collide, the boundary or
exclusion. Procedures stay in the skill or agent body.

Hooks are excluded. They are selected mechanically by runtime events and
matchers, and remain governed by the 100-line cap and behavioral tests.

## Consequences

Positive:

- Nuanced skills and agents can carry the triggers and exclusions needed for
  correct routing without violating the project convention.
- The hard gate, tests, and living documentation agree on one limit.
- The 500-character ceiling remains below half of the portable 1,024-character
  format limit and bounds always-loaded catalogue context.

Negative:

- A 251-500 character description adds catalogue context and therefore needs a
  visible non-blocking report.
- Length alone cannot prove better routing; behavioral discovery evaluation
  remains a separate concern.
- The human-readable value 500 differs from the prior implementation's 512 and
  requires a small compatibility cleanup.

## Alternatives considered

- **Keep 200 as a hard cap:** rejected because it forces nuanced trigger and
  exclusion clauses out of the only portable discovery field.
- **Keep 512 as the only cap:** rejected because it has no editorial target and
  was never propagated to the doctrine, so it controls validity but not quality.
- **Use the portable 1,024-character maximum:** rejected because descriptions
  are advertised up front across the catalogue and should not become miniature
  instruction bodies.

## Reversal cost

Low. Changing either numeric threshold affects one gate, a small set of tests,
and living documentation. Descriptions already over a future lower hard cap
would need to be shortened before the gate could move back.
