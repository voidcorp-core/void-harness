---
schemaVersion: 1
id: "adr:b93f13a9-3877-480d-a722-39476f93d84d"
createdAt: "2026-07-29T17:57:31.881Z"
title: "A session handoff routes state to its owner and records only the residue"
status: proposed
deciders: []
supersedes: []
---

# A session handoff routes state to its owner and records only the residue

## Context

Work in this harness spans sessions. A session ends and the next one starts with an empty
context, reconstructing state from the diff, the tracker and the branch name. It reconstructs
*what was done* accurately, because that is written down, and *what was ruled out* not at all,
because nothing records it — so it re-attempts a dead end, confidently, since the dead end
presents itself as the obvious first idea.

The obvious response is a handoff document that summarises the session. That response fails in a
specific way we have already seen elsewhere in this repository: the document becomes a second
copy of state that already lives somewhere authoritative. `plans/ACTIVE.md` had to be given an
explicit rule for exactly this — the tracker owns mutable execution state, and the durable file
never stores a hand-maintained "next ticket" — because two copies of a fact means one of them is
wrong within a day and the reader cannot tell which.

So the question is not "what should a handoff contain", it is "what does a handoff contain that
nothing else already holds".

## Decision

A session handoff routes every fact to its authoritative owner first — tracker for execution
state, diff for what the code does, doctrine for durable rules, memory for cross-session facts,
an ADR for a decision with a credible alternative — and records only the residue: dead ends with
their reason, assumptions labelled as unverified, proofs bound to the commit they were proven
against, and exactly one next action specific enough to execute.

## Consequences

Positive:

- The handoff is short by construction, and its length is a signal: a long one means the routing
  step was skipped.
- The expensive half of a session's knowledge — what was ruled out — is the part that gets
  written down, instead of the cheap half that the diff already carries.
- No fact has two homes, so nothing can drift out of sync with its own copy.
- A proof carries the commit it was green on, so a stale proof is visible rather than trusted.

Negative:

- The author must decide where each fact belongs before writing, which is more work than
  narrating the session and is easy to skip under time pressure.
- A handoff written by someone who skips the routing step looks correct and is a duplicate; the
  discipline is enforced by an exit test, not by a schema.
- Facts routed to the tracker or to doctrine require those systems to be reachable at the moment
  of closing.

## Alternatives considered

- **A session summary document.** Rejected: a narrative of what happened duplicates the commit
  messages and the tracker, ages badly, and buries the next action at the bottom. It is pleasant
  to write and nearly useless to read, which is why it is the default failure.

- **A symmetric save/restore pair**, as gstack's `/context-save` and `/context-restore` do.
  Rejected on the restore half: the next session should read the tracker and the memory, which
  are authoritative. A restore file would duplicate them and would be trusted while stale —
  precisely the failure the routing rule exists to prevent. Only the closing half is kept.

- **An automatic hook on session end.** Rejected for the reason `learning-capture` already
  documented for its own Stop nudge: a stop event cannot distinguish an interruption from a
  context limit from a completed turn. A handoff written on a false positive is authoritative and
  describes a moment nobody chose, which is worse than no handoff at all. The trigger stays
  human, or the model's own reading of the conversation.

- **Moving tracker state as part of closing** (for instance marking the unit done). Rejected: a
  session ending is not a unit completing, and conflating them is how a stopped ticket ends up
  marked done.

## Reversal cost

Low. The skill writes nothing on its own and adds no schema, no storage and no CLI surface —
it is prose plus a command. Withdrawing it leaves the tracker, the memory and the ADR log
exactly as they were, since those are where the facts were routed in the first place.
