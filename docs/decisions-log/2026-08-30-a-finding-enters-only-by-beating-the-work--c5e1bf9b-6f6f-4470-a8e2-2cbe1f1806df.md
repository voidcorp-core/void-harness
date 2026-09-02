---
schemaVersion: 1
id: "adr:c5e1bf9b-6f6f-4470-a8e2-2cbe1f1806df"
createdAt: "2026-08-30T09:44:00.000Z"
title: "A finding enters the work only by beating the work in progress"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# A finding enters the work only by beating the work in progress

## Context

Work on this repository stopped converging. On 2026-08-30 a plan written in one morning grew
from two slices to eight, with three open decisions and four new tickets, none of which came
from a run that failed. Every one of them came from reading code, and every one was defensible
on its own. The objective — a brainstorm / implement / autopilot trio that is usable — kept
moving away as the reading found more.

The cause is mechanical rather than a lapse of discipline. Reading code finds defects without
end, because there is always another inconsistency to see. A run finds only the defects that
block it, which is a short and finite list. Nothing in the workflow told the difference, so both
arrived through the same door and both became work.

The failing part is not classification. When a defect is found it is compared against nothing at
all, and against nothing everything wins. Asking an agent whether a finding is "important"
returns yes, because importance is taste and taste is what produced the eight slices.

## Decision

A finding enters the work only by winning a forced comparison against the unit currently being
built, judged against the program's stated objective. There are exactly three outcomes and one
slot, which is the next unit:

1. **It blocks the current unit** — it is fixed inside that unit, now.
2. **It beats the current unit** against the program objective — it becomes the next unit, and
   the disposal is forced: the next unit does not start until this one is disposed of.
3. **It loses** — it is dropped. Not stored, not filed, not deferred.

Because there is one slot and a total order, no queue can accumulate. The only thing ever
written down is **evidence that could not be reconstructed** — a failure observed once, a
measurement — recorded as one line with the command that replays it. Never the opinion, never
the proposed fix.

Each arbitration leaves an auditable trace in the run's recap, in one line naming what was found
and why it lost. The trace is ephemeral by design: it is checkable at the moment the judgement
is made, and gone afterwards.

Two admission rules constrain what can even be compared:

- **Nothing is filed from a reading nobody asked for.** A finding from a file no one convened
  the reader on is not admissible. If it matters it will be found again by someone who was asked.
- **An ambition claim is not an admission ticket.** A tenfold improvement belongs to
  `void-brainstorm`, on a named subject, deliberately. It is not an escape hatch during
  execution, which is precisely how the eight slices arrived.

Prose incoherence is a first-class finding, in four forms: inside one skill, between two skills,
between the user's stated demand and a skill, and between a skill and the code it describes.
The last is this repository's repeat offender — a skill asserted the opposite of its own CLI
twice in one week.

## Consequences

Positive:

- The backlog stops absorbing the cost of reading. What is not necessary now is not recorded
  now, so no future session inherits a queue nobody ranked.
- The comparison is decidable by an agent, because it is made against a named artifact — the
  current unit and the program objective — rather than against an abstract standard.
- No human bottleneck on findings. The one human gate left is on direction, once per plan, when
  a full run is reviewed.
- The two rules that made the plan grow are named and closed: unbounded reading, and ambition
  used as an entry ticket.

Negative:

- **Dropped means lost.** A real finding may have to be rediscovered, which costs the discovery
  again. This is accepted because a genuine defect is rediscoverable by construction: a skill
  that lies will lie to the next reader, and a run will trip on it again.
- The arbitration is made by the same agent that found the thing, so it is judge and party. The
  forced comparison and the recap line are what keep that honest; neither is a proof.
- A finding that is real, rare, and expensive to rediscover can be lost. The evidence exception
  is deliberately narrow to keep the rule from eroding, and narrow rules cut the wrong way
  sometimes.

## Alternatives considered

- **A capped deferred list drained by a human at the end of the run.** Rejected: the human gate
  is a bottleneck the maintainer explicitly does not want, and `.void/requests.md` already
  demonstrates the failure mode — it carries items opened on 2026-08-20 that nothing drained.
- **Classify each finding as bug / error / tenfold improvement, and admit those three.** Rejected:
  it classifies what a thing *is* rather than what it costs, and the categories are arguable.
  Most of what was found on 2026-08-30 was neither a crash nor a lie in the narrow sense — a
  specialist reading blind returns a plausible answer — yet all eight slices could have been
  argued into "bug or tenfold".
- **Let the agent judge relevance against doctrine and prior decisions, with no forced
  comparison.** Rejected: that is the procedure already in effect, and it produced the growth
  this decision exists to stop.
- **File everything and prune the backlog periodically.** Rejected: pruning is the same judgement
  made later with less context and more items, which is strictly harder.

## Reversal cost

Low. The rule lives in skill prose (`void-ticket`'s admission gate and `void-implement`'s recap)
and in no compiled contract. Reverting means deleting those sections; nothing persists that would
need migrating, precisely because the decision's content is to persist nothing.
