---
schemaVersion: 1
id: "adr:09cb20a7-d1bd-4b2a-a708-e035d0a6b2ce"
createdAt: "2026-09-02T00:53:31.943Z"
title: "A stray footprint is refused where both lists are still in hand"
status: accepted
deciders: []
supersedes: []
---

# A stray footprint is refused where both lists are still in hand

## Context

`orchestrate` receives `tickets` and `footprints` together and re-emits the footprints for
`reconcile` to audit on. It never compared the two.

`orderWorkers` reads footprints through a map keyed by ticket, so an entry naming a ticket this run
never listed is simply never looked up: nothing notices it, and the over-long list is copied into
the outcome and carried the length of the run. It is caught at the very end, by
`requireSymmetricDeclaration`, whose refusal is strong and whose remedy reads "pass `cluster` as
EVERY ticket the run reserved, blocked ones included" -- pointing the operator at `cluster`, the
one list that was right. The cost is a whole run, and then a correction applied to the wrong file.

Only that direction is a fault. A ticket listed with no footprint is ordinary at this step:
`orderWorkers` gives it `unknown-footprint` and a sequential lane, which is the conservative
reading and not a contract failure.

## Decision

`orchestrate` refuses a footprint whose id is absent from `tickets`, with `AUTOPILOT_CONTRACT`,
naming the stray ids and `footprints` as the list that holds them. The symmetric check downstream
stays exactly as it is: this narrows when the failure is noticed and which list the message blames,
never what is ultimately accepted.

## Consequences

Positive:

- The refusal costs one orchestration call instead of one run, and it names the file the operator
  has to edit.
- Both lists are compared at the one step that holds them side by side, rather than reconstructed
  from a value carried through a fresh context.

Negative:

- One more refusal on the input of a step that previously accepted anything `orderWorkers` could
  ignore. A caller that was passing a superset of its cluster now fails and must trim the list.

## Alternatives considered

- **Leave it to `requireSymmetricDeclaration`.** It already refuses, and fail-closed either way.
  Rejected on when and on what it says: the refusal arrives after every worker has run, and its
  guidance sends the operator to `cluster`. A correct verdict pointing at the wrong list costs more
  than the check it replaces.
- **Reword the downstream refusal to mention both lists instead.** Cheaper and touches one string.
  Rejected because it keeps the whole run as the price of a typo in a JSON payload, and the reader
  of that message is a fresh context that has neither list in front of it.
- **Drop the stray entries silently and carry on.** The tolerant reading, matching what
  `cluster-plan` does with a malformed candidate. Rejected: that tolerance exists so one bad
  candidate cannot deny an operator the rest of a selection pool. Here the cluster is already
  confirmed, nothing is being selected, and a footprint for a ticket nobody reserved means the
  caller's two lists disagree about what this run is.

## Reversal cost

Low. One pure function of five lines in the orchestrate command and its test. Nothing persists and
no other step reads its result.
