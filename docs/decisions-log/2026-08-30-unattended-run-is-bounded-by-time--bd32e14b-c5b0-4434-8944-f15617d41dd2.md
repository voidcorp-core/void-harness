---
schemaVersion: 1
id: "adr:bd32e14b-c5b0-4434-8944-f15617d41dd2"
createdAt: "2026-08-30T06:06:12.612Z"
title: "An unattended run is bounded by time, and an invocation may only shorten it"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# An unattended run is bounded by time, and an invocation may only shorten it

## Context

An autopilot run that may merge its own integration branches keeps going: it
takes a unit, integrates it, verifies the base, and takes the next one. Something
has to end it other than the backlog running dry, because the whole value of
chaining rests on the chain stopping the moment the base stops being trustworthy
-- and a run nobody is watching is exactly the one that needs a second bound.

The obvious bound is a ticket count, and it is what the cluster already uses:
`clusterSize` caps how many units one integration carries. Extending it to the
chain would have cost nothing to build.

It answers the wrong question. "Drain the backlog while I am out" is a duration.
Someone saying it means two hours, or an afternoon, or until tomorrow morning --
never five tickets, because they have no idea how long five of their tickets
take, and neither does the run before it starts. A count of five is twenty
minutes of typo fixes or a day of migrations, and the person who set it learns
which one only when they come back.

The same confusion shows up in what people type. A bare `6` could be six hours or
six tickets, and an unattended run that guesses wrong runs for a day.

## Decision

The chain is bounded by **time**. `autopilot.chainBudget` declares a duration,
two hours by default, written the way a person says it: `2h`, `90m`, `1h30m`. A
bare number is refused rather than interpreted.

The budget decides whether to **start** another unit, never whether to cut one in
half, and it decides from what this run has actually taken -- so it does not
begin a unit that cannot finish inside what is left.

An invocation may shorten a single run and may never lengthen it. The programme
block is the consent to run unattended; a command line that could widen it would
make the declared duration a suggestion, which is the same move as consenting to
a machine merge with a flag.

## Consequences

Positive:

- The bound is in the unit the person actually reasons in, so setting it needs no
  knowledge of how long their tickets take.
- A run cannot exceed what was declared for it, whatever the invocation asks. The
  declaration stays the ceiling, matching how consent to a machine merge already
  works.
- A budget stop is a nominal end and reads as one, distinct from the failure stop
  on a red or unverified base.

Negative:

- A run can stop mid-backlog with ready units left, which a count-based bound
  would not do as visibly. It is the intended behaviour and still costs a second
  invocation.
- The projection that decides whether the next unit fits is an average over this
  run. A cluster whose last unit is far larger than its first will be started
  when it should not have been, or skipped when it would have fit.
- Time spent is not effort spent. A run blocked on a slow remote burns budget it
  did not use, and the bound cannot tell the difference.

## Alternatives considered

- **Bound by ticket count, reusing `clusterSize`.** Rejected: a count says
  nothing about the duration anyone is actually authorising, and the person
  setting it cannot convert between the two. It is cheap to build and answers a
  question nobody asked.

- **Bound by both, whichever comes first.** Rejected as two bounds where one
  suffices: the count would almost never bind, and the run would report a stop
  reason that means nothing to the person reading it. If the count is not the
  bound anyone reasons in, adding it only adds a second explanation to write.

- **No bound; run until the backlog is dry.** Rejected: an unattended run with no
  second stop condition is bounded only by how long it takes to notice. The base
  verification catches a broken merge, not a run that is simply still going at
  midnight.

- **Let the invocation set any duration it likes.** Rejected: it turns the
  declaration into a default and the command line into the real authority, which
  is precisely the arrangement the merge gate refuses. Shortening is safe because
  it can only narrow what was consented to.

## Reversal cost

Low. The budget is two numbers passed into a pure decision function; removing it
or replacing it with a count changes one branch and the sentence describing it.
No state persists between runs, so nothing has to be migrated.
