---
schemaVersion: 1
id: "adr:eb08fcc8-d50a-4574-89da-d5a174f4035d"
createdAt: "2026-09-19T17:17:51.784Z"
title: "Bound independent review by correction batches and concrete evidence"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Bound independent review by correction batches and concrete evidence

## Context

WORK mission recovery exposed repeated general panels and delivery refusals caused
solely by runtime attestation. The user explicitly requires bounded review while
retaining actual independence, exact version binding and concrete defect resolution.

## Decision

Evolve the existing Mission Engine to run one independent general review on an exact
commit and base, followed by at most two correction batches with targeted verification.

Risk-specific specialists advise before implementation. The implementer alone edits.
The reviewer is read-only and supplies a minimal traceable receipt bound to the task,
acceptance criteria and immutable subject. Native context identity is supplementary
provenance: an absent or refused identifier alone cannot reject an otherwise evidenced
independent review. Actual independence must never be inferred from a self-assertion.

Only demonstrated defects in scope block. Advisory findings do not consume correction
budget. Partial responses, transport repair and recovery neither spend nor reset it.
One point-specific independent arbitration is permitted without reopening general review.
Historical findings remain until explicitly resolved; affected proofs are invalidated.
Explicit recovery validates original review evidence and appends history, never promoting
a degraded result automatically or replaying completed effects.

## Consequences

Positive:

- Review effort tracks concrete corrections instead of re-examining the entire task.
- Runtime provenance limitations remain visible without becoming invented certification.
- Existing missions retain their history, budgets and useful evidence.

Negative:

- Legacy receipts need explicit validation before adopting the new behavior.
- Missing actual independence or unresolved blockers still prevent delivery.
- Targeted review requires recording defect resolutions and affected evidence accurately.

## Alternatives considered

- Keep repeated general panels and increase round limits: rejected because it extends
  the observed loop and does not distinguish correction from transport recovery.
- Remove review gates entirely: rejected because exact subject, independent execution
  and unresolved concrete defects remain meaningful delivery requirements.
- Introduce a second review engine: rejected because dispatch and validation would have
  competing authorities; existing controller and event history must remain authoritative.

## Reversal cost

Medium: versioned receipts and persisted correction budgets require compatibility on
replay. Reverting code must not erase events or reinterpret old verdicts. Activation in
consumer installations remains separate from implementation and verification.
