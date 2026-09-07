---
schemaVersion: 1
id: "adr:33796d68-e270-4d08-9c3d-f3d2f4247273"
createdAt: "2026-09-07T16:57:11.664Z"
title: "Separate fast verification from agent campaigns"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Separate fast verification from agent campaigns

## Context

The repository currently has two different questions mixed in one execution
loop: whether the current diff is safe to integrate, and whether an external
agent can produce a quality patch. `pnpm verify` is intentionally a complete
release proof, while a campaign cell is an expensive and failure-prone external
run. Running either one inside every cell creates long sequential runs, repeats
the same builds, and allows infrastructure failures to consume the remaining
budget before the result is interpretable.

Current evaluation practice separates task, solver, scorer and bounded sample
limits, and records resumable logs. See Inspect's task model and limits:
https://inspect.aisi.org.uk/tasks.html. CI practice uses bounded matrix
parallelism, fail-fast behavior and artifacts for aggregation:
https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations.

## Decision

We will operate three explicit lanes: a fast local changed-surface lane, a
targeted integration lane, and an independent agent campaign lane with bounded
parallelism, per-cell limits, durable progress and a final release verification
only after integration.

## Consequences

Positive:

- Normal edits get feedback in seconds or minutes instead of waiting for the
  release suite.
- A campaign can stop at the first infrastructure failure, resume from sealed
  cells, and preserve unknown results without spending the remaining budget.
- The full release proof remains strong and is not weakened to make evaluation
  faster.
- Agent quality is judged from task-specific acceptance evidence and a clean
  integrated checkout, not from a worker transcript or an exit code.

Negative:

- There are three commands and three kinds of evidence instead of one universal
  command.
- Campaign infrastructure needs a small durable ledger and an aggregator.
- Parallel cells consume more temporary disk and may hit provider concurrency
  limits, so the cap must remain conservative.

## Alternatives considered

- **Run `pnpm verify` inside every cell**: rejected because it repeats release
  work, couples agent behavior to repository-wide timing, and made the campaign
  fail on output and timeout infrastructure before quality was measured.
- **Delete subprocess and network verification**: rejected because those are
  real trust-boundary contracts; they move to the integration/release lanes,
  not to the trash.
- **Keep 27 calls sequential with a larger timeout**: rejected because a larger
  timeout only makes a bad run consume more time and does not provide bounded
  concurrency, early cancellation, or resumability.
- **Trust a single aggregate score**: rejected because modern eval systems keep
  per-sample scores and logs, and a missing or contaminated sample must remain
  unknown rather than becoming a zero or a green.

## Reversal cost

Low. The lanes are command and orchestration boundaries over the existing
tests, evidence contracts and runtime adapters. Reverting the scheduling layer
does not change application behavior or the release artifact.
