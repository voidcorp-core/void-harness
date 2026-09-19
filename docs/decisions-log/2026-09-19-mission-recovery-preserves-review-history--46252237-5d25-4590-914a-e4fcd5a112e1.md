---
schemaVersion: 1
id: "adr:46252237-5d25-4590-914a-e4fcd5a112e1"
createdAt: "2026-09-19T10:47:09.555Z"
title: "Mission recovery preserves review history and bounded correction cycles"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Mission recovery preserves review history and bounded correction cycles

## Context

An unchanged incomplete review panel consumed a correction round. Another dispatch
issued an envelope rejected by its own validator after inputs changed. Terminal
closure prevented normal resumption. Recreating a mission would conceal history
and reset the limits the review system exists to enforce.

## Decision

Recover through an explicit validated append-only transition in the original
mission, with one admissible-cycle rule for dispatch and result validation.

Keep all original events, findings, identity and truly consumed budget. Pure core
admission proves the defect or unresolved blocker disposition from bound evidence.
It calculates any correction to the projection; callers provide no counters.
A recovery event identifies a new lifecycle episode and permits later closure.
Recovery admits required correction or clarification, never approval. Ambiguous
effects, invalid provenance and genuinely exhausted budgets remain refusals.

Keep completion v1 compatible. Legacy requests remain due now. An explicit native
specialist clarification binds exact requests and typed deadlines rather than
inferring timing from prose. Stable obligations survive replacement reviews until
fresh bound evidence and authorized disposition discharge them at the due gate.

## Consequences

Positive: incident repair is reproducible without discarding original evidence or
silently granting another budget; specialist compatibility remains explicit.

Negative: all closure readers need a common lifecycle projection. Clarification
and discharge add a bounded protocol. Journal compare-and-append must be atomic.
Older binaries must refuse mutations of recovered missions they cannot interpret.

## Alternatives considered

- Create another mission: rejected because limits and continuity would reset.
- Rewrite prior rounds or closures: rejected because original evidence disappears.
- Raise the limit or ignore requests attached to PASS: rejected because genuine
  exhaustion and missing current evidence would cease to block.
- Replace installed specialist contracts immediately: rejected because isolated
  verification must not silently replace the published protection floor.

## Reversal cost

Medium. Once shipped, readers must retain compatibility with recovery episodes and
outstanding evidence obligations. No accepted historical ADR is edited or deleted.
