---
schemaVersion: 1
id: "adr:a1469193-7840-4df4-bd1e-dc6d347a118a"
createdAt: "2026-08-31T17:21:24.000Z"
title: "A concurrency test proves safety, never the scheduler's order"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# A concurrency test proves safety, never the scheduler's order

## Context

The checkpoint lock serialises every mechanical write to `.void/machine/checkpoint.md`. One
end-to-end test spawned three real hook processes against a stale lock and asserted that exactly
one of them got through: `expect(paths.filter(...)).toHaveLength(1)`.

That test failed intermittently across three consecutive full `pnpm verify` passes and was read as
a safety violation: three writers had won an election that admits one, so a real session could
corrupt its own checkpoint under concurrent tool calls. The lock's check-then-act shape at
`context-continuity-executor.ts:256` — `lstatSync` then `unlinkOwnedPath` — made that reading
plausible.

It was wrong, and measurement is what settled it. Reproduced outside vitest under 24 concurrent
load generators, the assertion failed 54 times out of 72. In every single failure the checkpoint
was intact: one mechanical block, the objective preserved, all 25 000 body repetitions present,
the orphan recovery claim removed, no lock residue. The observations had *accumulated* — two or
three of them, never overwritten.

Accumulation is the proof. A writer reads the checkpoint only after taking the lock and replaces
it by rename. Two overlapping critical sections would therefore leave only the later observation,
because the later writer read a state that predated the earlier write. Three observations present
means three ordered reads, which means the lock held.

What the failures actually showed is that under load the first contender finishes and releases
before the next one even asks. The second then takes a free lock, legitimately. The test was
asserting that the operating system would schedule three processes closely enough to collide —
a property of the machine, not of the code.

## Decision

A test of a concurrency mechanism asserts what must hold **whatever the interleaving**, never how
many contenders happened to meet.

Concretely, for the checkpoint lock and anything shaped like it:

- **Assert safety.** No admitted writer erased another; the artefact is structurally intact after
  the run; every recorded success has its work still present, and every recorded skip has none.
  The correspondence between recorded outcomes and surviving work is the assertion with teeth: an
  `ok` whose observation is missing is exactly the overwrite a lock exists to prevent.
- **Assert liveness.** A no-wait loser is replayable, and replaying it admits its work.
- **Never assert contention.** "Exactly one wins" is a scheduling outcome. It is true on an idle
  machine and false on a loaded one, and both are correct behaviour.

Mutual exclusion itself is proved where it can be proved deterministically: in-process unit tests
that hold a lock and show the next claim refused. Those already exist for the stale-lock takeover
and stay the authority on the mechanism.

## Consequences

Positive:

- The failing assertion is gone at its cause rather than stabilised around, and the suite stops
  reporting a defect the code does not have. Five passes of the rewritten test under the load that
  reproduced the failure at will are green.
- The end-to-end test now refuses a strictly more dangerous failure than the one it refused
  before. Overwriting was previously invisible to it: three contenders whose writes clobbered each
  other would leave one observation and pass the old `toHaveLength(1)`.
- The judgement that a lock test cannot own scheduling is written down, so the next flaky
  concurrency assertion is diagnosed rather than re-litigated.

Negative:

- The end-to-end test no longer proves that contention is exercised at all. On a fast machine it
  may admit one writer, on a slow one three, and it cannot tell the difference between a working
  lock and an absent one on its own. That proof moves to the unit tests, which is where it can be
  made deterministic, and the split has to be understood by whoever reads either half.
- Reading recorded outcomes against surviving work is more test code than a length assertion.

## Alternatives considered

- **Bound vitest concurrency until the test stops failing.** Rejected: it removes the load that
  surfaces the behaviour without changing what the assertion claims, and it would have buried a
  real overwrite just as effectively as a fake one. This was the standing plan before the
  measurement; the measurement is what disqualified it.
- **Make contention deterministic with a synchronisation barrier between the three processes.**
  Rejected: the test drives the real hook binary on stdin and has no way to hold a contender
  inside the critical section without instrumenting production code for the benefit of a test.
  Paying in production shape for a scheduling guarantee is the wrong trade.
- **Fix the check-then-act at `context-continuity-executor.ts:256`.** Rejected as premature: the
  sequence is guarded by the recovery-claim fence and by `O_EXCL`, no evidence of an actual
  violation was produced, and 72 measured runs produced none. Refactoring a lock on suspicion is
  how a working lock acquires a bug.

## Reversal cost

Low. One test file and this decision. The lock implementation is untouched by it, so reverting
means restoring an assertion, not a mechanism.
