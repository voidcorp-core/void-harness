---
schemaVersion: 1
id: "adr:fcc230d9-3324-42a7-afb8-b4922b0cb0f0"
createdAt: "2026-08-30T09:21:36.594Z"
title: "The panel is a floor, the lens is what shrinks"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# The panel is a floor, the lens is what shrinks

## Context

The expert-team spec and the shipped routing code disagreed about who is consulted on a ticket,
and the disagreement blocked the slice that makes the panel convene before the first line of
code.

`docs/specs/2026-08-30-expert-team-execution.md` says every ticket convenes the panel and that
only the depth of each answer scales with the work. `packages/mission-engine/src/specialist/routing.ts`
implements the opposite: a specialist whose `appliesWhen.any` predicates match no signal is
routed `not-applicable`, and `controller.ts` then filters it out of `invoke-specialists`
entirely. On a small ticket the panel silently shrinks to whoever the classifier happened to
match.

The measured objection to the floor is real: five specialists at roughly 12 000 tokens each is a
per-ticket bill, and on an XS ticket most of it buys the sentence "no trust boundary touched".
That objection is about the size of the answer, not about who is asked.

## Decision

Every canonical specialist is convened at the pre-implementation stage of every ticket, and
`appliesWhen` stops deciding **whether** a specialist speaks and starts deciding **how much** it
says: a matched predicate opens the full lens, an unmatched one reduces it to a bounded
no-finding answer.

A specialist that is not selected leaves no trace; a specialist convened through a reduced lens
returns a short, recorded, auditable "nothing here" that a reader can point at.

## Consequences

Positive:

- A panel that fires every time is a panel that can be trusted, and its silence becomes evidence
  instead of absence.
- The cost objection is answered where it belongs — in the size of the answer — rather than by
  removing the reader who would have caught the thing.
- The classifier's mistakes stop being invisible: a wrong predicate now produces a cheap answer
  instead of no answer.

Negative:

- Every ticket pays a floor cost, bounded but never zero.
- The reduced lens needs its own budget and its own test, or it drifts back into a full pass.
- `routeSpecialists` keeps a `not-applicable` state that no longer gates convocation, so the
  name must change with the behaviour or it will mislead the next reader.

## Alternatives considered

- **Keep the predicate-selected subset** and amend the spec to match the code. Rejected: it is
  the cheaper option only until the one ticket where the unmatched specialist was the one that
  mattered, and nothing in the record would show it was never asked.
- **Convene the full panel with a full lens every time.** Rejected on measured cost: five times
  12 000 tokens per ticket, most of it spent restating that nothing applies.
- **Let the writer choose which specialists to convene.** Rejected: the writer is exactly the
  party whose blind spots the panel exists to cover.

## Reversal cost

Low. The change is confined to how `appliesWhen` is consumed in `routeSpecialists` and to the
lens carried in the specialist envelope. Reverting means restoring the `not-applicable` filter in
`controller.ts`; no data migration and no published contract is involved.
