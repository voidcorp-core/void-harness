---
schemaVersion: 1
id: "adr:f91fa744-be1d-485a-bbe1-935f410de8c4"
createdAt: "2026-09-07T22:27:51.176Z"
title: "Require enforced bounds for evaluation budget admission"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Require enforced bounds for evaluation budget admission

## Context

The evaluation approval parser does not reserve money. The durable runner avoids
replayed execution but delegates spending authority. A reservation or timeout
alone cannot guarantee that a runtime stays within an approved spending limit.
Folpe approved the conservative contract on 2026-09-08 in
[the budget spec](../specs/2026-09-07-eval-durable-budget-admission.md).

## Decision

Require a durable maximum-cost reservation and a verified enforced execution
bound before admitting any paid evaluation, retaining reservations after uncertainty.

## Consequences

Positive:

- Recovery cannot refill the approval or silently replay uncertain spending.
- Reuse the existing admission journal; do not build a second controller.

Negative:

- Runtimes without a verified bound remain blocked, including Codex until such
  a capability is established. This decision does not establish that capability.
- No automatic refunds, even after a lower observed cost or a failed execution.
- Local tests cannot certify provider billing or authorize a paid canary.

## Alternatives considered

- Estimate and stop later: rejected because an in-flight execution can overspend.
- New per-call billing proxy: deferred because changing transport changes the
  evaluated condition and introduces a runtime outside the approved slice.

## Reversal cost

Medium. A weaker guarantee requires a superseding decision, revised approval
language, archive-version handling and new negative tests. Old uncertain
reservations must never be refunded implicitly by that migration.
