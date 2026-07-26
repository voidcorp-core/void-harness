---
schemaVersion: 1
id: "adr:c74b307b-8c2e-44cb-a122-58f3f2337bfa"
createdAt: "2026-07-24T16:06:34.115Z"
title: "Use one canonical sequenced mission journal"
status: accepted
deciders: ["folpe"]
supersedes: ["legacy:2026-07-09-activations-jsonl-is-the-single-telemetry-source-usage-log-i"]
---

# Use one canonical sequenced mission journal

## Context

The v2 hook layer wrote attempts and outcomes to separate, unordered JSONL
files. Readers could correlate best-effort sessions, but could not prove event
continuity, resume a live stream exactly or distinguish a real empty period from
a truncated write. The hot hook path must remain account-free, cross-runtime,
offline and unable to leak prompt, command, output or secret content.

## Decision

Use one append-only, schema-versioned journal per opaque mission at
`.void/runs/<mission-id>/events.jsonl`, with a continuous per-mission sequence
assigned by a generated dependency-free Node writer.

`@voidcorp/mission-engine` owns pure contracts and reducers.
`@voidcorp/hook-runner` owns Claude/Codex adaptation, redaction, locking and the
standalone `_void-hook.mjs` asset. Both packages remain private at `0.0.0` until
their internal API stabilizes. The pure engine builds with `tsc`; the hot runner
bundles with esbuild. We do not add new tsup configuration because tsup is no
longer actively maintained, and its replacement is not needed for these two
internal outputs.

Legacy activation, outcome and usage files remain readable but are never written
by current hooks. Mission Control projects the journal through authenticated
loopback SSE and reports any missing sequence as `PARTIAL`.

## Consequences

Positive:

- One ordered contract drives audit, behavior, cost, status and live replay.
- Concurrent hooks cannot duplicate or lose a sequence under one mission.
- The 23 KiB standalone writer has no install-time runtime dependency.
- Runtime-private IDs and tool content never reach the journal.
- v2 projects keep their historical signal during migration.

Negative:

- Per-mission lock/state files add small local I/O and stale-lock recovery logic.
- Global live ordering remains a projection of per-mission order; SSE therefore
  uses opaque event IDs and declares an unavailable cursor partial.
- Private packages are composed into published bundles rather than exposed as
  stable public APIs.

## Alternatives considered

- **Keep split activation/outcome logs**: rejected because correlation does not
  prove ordering, crash boundaries or reconnect continuity.
- **Use SQLite, OpenTelemetry or Graphify as the canonical store**: rejected
  because each adds an external runtime or module to the universal hot path.
- **Use one project-global sequencer**: rejected because unrelated missions would
  contend on a shared lock and isolated workers would regain a conflict surface.
- **Validate with Zod inside the generated hook**: rejected after measurement;
  the standalone bundle grew to roughly 550 KiB versus about 23 KiB for the
  specialized bounded validator.

## Reversal cost

Medium. Readers can keep importing schema v1 and legacy streams while a new
writer is introduced, but event identity, ordering and redaction guarantees must
survive any storage migration.
