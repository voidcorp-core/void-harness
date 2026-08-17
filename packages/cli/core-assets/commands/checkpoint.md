---
description: Close the current work session gracefully — before a clear, an interruption, or the end of a day. Route each fact to where state lives, then write the residue the next session cannot re-derive.
argument-hint: "[what you want carried over, in your own words]"
---

Run the `checkpoint` skill for the work in flight. It writes `.void/machine/checkpoint.md`,
which `void-harness resume` reads back.

Follow it in order, without shortcuts:

1. **Route first.** For every fact you are tempted to record, decide where it belongs —
   tracker, diff, doctrine, memory, ADR, or this checkpoint. Write it in its authoritative home
   first, then reference it. Anything already carried by one of those is not repeated here.
2. **Write the residue.** Where the work stands, what is proven and against which commit, the
   dead ends with the reason each was abandoned, every assumption labelled as unverified, what
   is open and who unblocks it, and exactly one next action specific enough to execute.
3. **Run the exit test.** A stranger must be able to take the next action without asking a
   question, and must not repeat a dead end after reading only this.

If the user passed an argument, treat it as what they specifically want carried over — cover it,
but do not let it replace the routing step.

Show the checkpoint before writing anything shared, and wait for an explicit yes. Do not move
tracker state as a side effect: a session ending is not a unit completing.
