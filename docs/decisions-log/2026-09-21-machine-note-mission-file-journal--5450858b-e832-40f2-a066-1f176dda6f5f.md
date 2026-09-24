---
schemaVersion: 1
id: "adr:5450858b-e832-40f2-a066-1f176dda6f5f"
createdAt: "2026-09-21T08:30:51.652Z"
title: "Record note missions in an append-only file journal"
status: proposed
deciders: ["folpe"]
supersedes: []
---

# Record note missions in an append-only file journal

## Context

The M2 note path runs two paid native calls, extraction then synthesis. A host
interruption between them lost the accepted extraction, and nothing prevented a
second host from launching the same step twice. The package supports Node >=22.12.
On 2026-09-21, local binaries showed `node:sqlite` absent at 22.12.0
(`ERR_UNKNOWN_BUILTIN_MODULE`) and an experimental warning on 22.21.1 and 24.14.1.
The future Docker run needs an explicit, mountable store with no home default.

## Decision

A note mission is an append-only directory of versioned JSON records, where each
revision is granted to one writer by an exclusive `link` and every step records
its dispatch intent before the native call.

The intent's execution id is the native session id, so the record names the native
call before it is spawned. A step with an intent and no outcome, or whose cancellation
is unconfirmed, is reported as unknown and never launched again. A record is checked
against the format before writing, and a link whose directory sync fails is reported
as unconfirmed; neither launches a step. A symbolic-link mission directory is refused. Receipts that block or pause write nothing. Recorded extraction and notes
are re-admitted by the sourced-note vertical before synthesis or delivery.
Corrupt, unknown-format or changed-contract records are kept byte for byte and
refused with a diagnostic. An observed failure stays terminal in this slice.

## Consequences

Positive:

- Works at the declared Node floor with no dependency and no native addon.
- Records are inspectable bytes; a directory of files mounts into a container.
- The compare-and-swap is one POSIX call, testable across real processes.

Negative:

- Durability after a process crash is tested. After a power loss it is not
  proven, and macOS `fsync` through Node does not flush the drive cache.
- An unknown step needs a new mission; no operator override exists yet.
- The adapter assumes a filesystem with atomic `link`; Windows is not covered.

## Alternatives considered

- `node:sqlite`, as in the legacy durable run: rejected for now because it is
  missing at the declared floor and warns on some supported versions; raising the
  floor is a repository decision outside this slice. WAL shared memory on mounted
  volumes was not measured here.
- better-sqlite3: rejected because a native addon adds install, musl and size cost.
- Temporary file plus `rename`: rejected because `rename` replaces an existing
  record, so two writers could both believe they won.
- A lease with expiry: rejected because an expired lease does not prove the
  holder stopped or that its native call did not spend.

## Reversal cost

Low: the journal sits behind a two-function port and only note missions use it.
Moving to SQLite later needs a reader for format `void-machine.note-mission/1`,
bounded to 16 small records per mission, and no change to the vertical.
