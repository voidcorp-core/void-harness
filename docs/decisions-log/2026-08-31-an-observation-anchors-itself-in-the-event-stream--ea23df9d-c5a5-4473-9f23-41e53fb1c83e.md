---
schemaVersion: 1
id: "adr:ea23df9d-c5a5-4473-9f23-41e53fb1c83e"
createdAt: "2026-08-31T18:24:33.000Z"
title: "A change observation anchors itself in the event stream, or admits it is uncertain"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# A change observation anchors itself in the event stream, or admits it is uncertain

## Context

`ProjectChangeJournal` watches a project with `fs.watch` and hands the build a generation number.
The build compares that number before and after its work: unchanged means the tree stood still and
the cache may be reused, changed means something moved underneath it and the snapshot is not
publishable.

A test held that a still tree produced no `concurrent-change`, and failed intermittently under
load. The measurement that settled it is direct rather than circumstantial. A probe wrote a
fixture, opened the journal, took an observation, then polled `validate` on a tree nobody touched
again:

```
0: changed after 11ms -> packages/app/src/huge.ts
1: changed after 11ms -> packages/app/src/huge.ts
...
22 of 25 runs, always the file written before the watcher existed
```

The generation moved eleven milliseconds after the observation froze it, and the path it named was
written **before the watch was opened**. The journal was not detecting a mutation. It was being
handed the backlog of a stream it had never synchronised with, and calling it news.

`observe()` waited one turn of the event loop (`setImmediate`) before freezing its generation.
Node's own documentation rules that out as a synchronisation: event ordering is not guaranteed,
events may be duplicated or missed, and a recursive watch on macOS goes through FSEvents, which
coalesces and delivers on its own schedule. One tick is not a schedule anyone shares.

So the observation answered a question nobody asked it. Not *has the tree changed since you
looked*, but *has anything reached me yet* — and the two differ by exactly the events the stream
still owes. Whether the build read the answer before or after the backlog landed depended on how
loaded the machine was, which is why it looked like flakiness.

The same gap runs the other way in `validate()`, and there it is worse: an unsynchronised stream
answers `valid` about a tree that *did* move, because the events proving it had not arrived yet. A
stale snapshot published as fresh.

## Decision

An observation synchronises with the event stream before it freezes a generation, by anchoring
itself in that stream.

A sentinel file is written into the watched tree and the observation waits, under a bounded
deadline, to see the sentinel's own event come back. Everything the stream already owed is
delivered before it, so what remains after it is genuinely later than the observation. This is the
mechanism Watchman calls a cookie, and its reason for preferring it to a delay holds here
unchanged: a delay guesses at load, an anchor does not.

The rules that make it sound:

- **`validate` anchors too**, for the opposite reason — to stop agreeing with a stream that has not
  caught up. Failing to anchor there is reported as `unavailable`, never as agreement.
- **What cannot be anchored is `uncertain`, never `unchanged`.** A read-only tree, a volume that
  does not notify, a deadline exceeded: each means the journal cannot prove the tree stood still,
  and the honest answer already exists in its vocabulary. The build then verifies file identities
  itself, which is slower and always correct.
- **A sentinel is never a change.** The name is reserved (`.void-journal-anchor-`) and refused by
  scanning, so it cannot be indexed in the milliseconds it exists, and every journal ignores every
  sentinel — including another process's, whose synchronisation is not this project's change.
- **`.git` first, then `.void`, then the root.** `.git` for the reason Watchman writes there: it is
  watched like any other directory but no version control reports what is inside it, so a sentinel
  never surfaces in someone's `git status`.
- **Waiters are keyed by sentinel path.** Git inspection validates the observation while its
  commands run, so validations overlap routinely; a single waiter let the second overwrite the
  first, which then waited out its deadline and reported an uncertainty that never happened.

## Consequences

Positive:

- The false positive is gone at its cause, measured on the real filesystem: 25 runs of the probe,
  25 still, against 22 of 25 changed before. The test that had failed twice in five `pnpm verify`
  passes now passes twelve times out of twelve under the load that reproduced it at will.
- A whole class of defect closes with it, not one test. Every `concurrent-change` the journal could
  raise on a still tree came through this gap, including the one at the end of the build that
  refuses to publish a cache.
- The dangerous direction is closed too. `validate` could previously agree with a stream that owed
  it the very events that would have disagreed.
- What the journal cannot prove, it now says. `uncertain` was already in the vocabulary and was
  reachable only through watcher failure; it now covers the ordinary case of a stream that cannot
  be caught up with.

Negative:

- Every observation writes a file into the project and waits for an event: ~11ms measured, and a
  bounded 1s worst case before it degrades. Two of them per build. That is real latency added to a
  path that previously returned immediately and sometimes lied.
- The journal now writes into the tree it observes. It is a reserved, short-lived name in a
  directory nothing indexes, but a build that was read-only no longer is.
- `ProjectWatchPort` gained a method, so every injected port must answer it, tests included. A port
  that does not is not broken — it degrades to `uncertain` — but a test that meant to prove reuse
  will find itself proving degradation instead.

## Alternatives considered

- **Wait a fixed delay before freezing the generation.** Rejected, and it is the shape the previous
  `setImmediate` already had. A delay long enough on an idle laptop is not long enough on a loaded
  runner, which is the exact failure being fixed; Watchman rejects it for the same reason.
- **Bound vitest concurrency so the load never appears.** Rejected: it hides a defect that exists
  outside the suite. Writing a file and building immediately afterwards is ordinary, and it
  produced a false `concurrent-change` in any consumer project, not only here.
- **Keep the stream unsynchronised and stop trusting `changed` from the journal at all.** Rejected
  as too blunt: it throws away the cache reuse the journal exists to enable, and it leaves
  `validate` agreeing with a stream that has not caught up — the dangerous direction, untouched.
- **Poll file identities instead of watching.** Rejected: it is the design the journal deliberately
  replaced, and it costs a full traversal per build, which is what the cache exists to avoid.

## Reversal cost

Moderate. The anchor is one function in the journal, one reserved name in the scanner, and one
method on a published port type. Reverting means restoring a `setImmediate` and removing the port
method — mechanical — but it restores the false positive with it, so the reason would have to be
better than the measurement that motivated this.
