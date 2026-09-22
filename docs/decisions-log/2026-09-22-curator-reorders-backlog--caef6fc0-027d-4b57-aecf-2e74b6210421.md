---
schemaVersion: 1
id: "adr:caef6fc0-027d-4b57-aecf-2e74b6210421"
createdAt: "2026-09-22T15:17:56.008Z"
title: "The curator reorders the backlog, within limits"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# The curator reorders the backlog, within limits

## Context

The harness doctrine holds backlog curation as a human gate: the Autonomous mode section of
`CLAUDE.md` and `AGENTS.md` lists "HITL at backlog curation and at the promotion to production"
among the durable boundaries of autopilot. Under the cluster engine that meant a person confirmed
each cluster before a worker started, and the tracker's priority labels decided what came first.

The [continuous loop spec](../specs/2026-09-22-autopilot-native-loop.md) removes the per-cluster
confirmation: the loop keeps up to four slots busy and gives each free slot to the head of a
ranked queue. Somebody has to rank that queue after every merge. Asking a person each time
reinstates the wait the loop exists to remove, and ranking by the priority label follows a guess
made when the ticket was filed rather than the state of the project today.

Folpe approved the spec, which delegates that ranking to a dedicated curator agent.

## Decision

Backlog curation is delegated to the `void-autopilot` curator, within fixed limits: it reads the
project, ranks Todo then Backlog then Triage on the project's interest rather than the priority
label, and realigns the tracker's priority and status with that ranking, but it never closes,
cancels or deletes a ticket, and it justifies every move on the ticket it moved.

- **Justified moves.** Every ticket whose priority or status the curator changes carries a comment
  of one or two sentences saying why. A move without a reason is indistinguishable from a mistake,
  and the comment is what lets a person reverse it.
- **No disposal.** Closing, cancelling, deleting or marking a duplicate stays human. The curator
  says so in a comment and leaves the ticket where it is.
- **Enrichment before readiness.** A vague ticket goes through `void-ticket` before the curator may
  declare it `ready`; one still ambiguous is set aside with its reason.
- **Typed output.** The ranking reaches the loop as a `CuratorQueue` judgment admitted by schema:
  at most sixteen entries, each with a justification and a declared footprint. The curator decides
  what is worth doing; the kernel decides what gets a slot.
- **Human gates stay.** Units listed in the programme's `humanGates`, the merge into the branch
  that deploys, and every disposal remain human.

## Consequences

Positive:

- Slots are refilled after every merge without waiting for a person, which is what makes the loop
  continuous.
- The order follows the project's current state — what unblocks, what extends the work in flight,
  what removes a real risk — instead of labels that aged.
- The tracker stays truthful: it shows the order the loop actually follows, with the reason next to
  each change.

Negative:

- A person no longer confirms what the loop takes. A poor ranking costs a slot until the next
  re-ranking, and can reorder priorities a person set on purpose; the justification comment is the
  only record, and reversing a move is manual.
- The doctrine line on HITL at backlog curation becomes false for autopilot. It is rewritten when
  the cluster engine is removed, together with the rest of the Autonomous mode section, not before,
  since the cluster engine still asks for the human confirmation it describes.
- The curator writes to the tracker at every re-ranking, which adds comment traffic on moved
  tickets.

## Alternatives considered

- **Keep curation human, confirm each assignment.** Rejected: it turns the loop back into a burst
  that waits for a person at every slot, the cost this change removes.
- **Rank by the tracker's priority label.** Rejected: the label records an estimate made when the
  ticket was filed, and the loop would faithfully execute stale priorities.
- **Let the curator also close or cancel obsolete tickets.** Rejected: disposal destroys
  information a person may still need, and a machine that is wrong about an obsolete ticket loses
  work silently. Moving a ticket is reversible from its comment; closing it is not noticed.
- **Rank without writing to the tracker.** Rejected: the queue would live only in the session,
  invisible to a person and lost on restart, while the tracker kept saying something else.

## Reversal cost

Low. Returning curation to a person means running the loop with a queue a person supplies, or not
running it; the tracker keeps every justification the curator wrote, so each move can be read and
undone. No data is lost, since the curator never disposes of a ticket.
