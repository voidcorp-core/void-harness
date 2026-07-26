---
schemaVersion: 1
id: "adr:4ebf4e7c-b918-4b38-a702-56339578d8c4"
createdAt: "2026-07-24T17:15:00.000Z"
title: "Use one immutable file per ADR without a shared index"
status: accepted
deciders: [folpe]
supersedes: ["legacy:2026-07-21-decisions-log-per-file"]
---

# Use one immutable file per ADR without a shared index

## Context

The harness already split decisions into separate files, but workers still
allocated sequential ADR numbers in consumer projects and regenerated a shared
`docs/DECISIONS.md`. Parallel features therefore retained two coordination
points: the next number and the projection bytes.

## Decision

Every ADR owns one Markdown file identified by `adr:<uuid>`. The CLI creates it
exclusively, validation treats accepted records as immutable, and Markdown or
JSON projections are rendered on demand without writing a shared artifact.

## Consequences

Positive:

- Independent workers can create decisions without coordination or merge repair.
- Stable identities survive filename conventions and support explicit
  supersession.
- The plain Markdown/YAML contract remains portable across agent runtimes.

Negative:

- Filenames are longer and no longer expose a human sequence number.
- Historical records keep a legacy virtual identity rather than being renamed.
- CI needs a base git revision to prove accepted-record immutability.

## Alternatives considered

- **Reserve sequential numbers in the launcher**: rejected because direct work,
  other orchestrators and rebases would still need coordination.
- **Keep a committed generated index rebuilt at integration**: rejected because
  it remains a broad conflict surface and duplicates reconstructible data.
- **Store decisions in a database**: rejected because it adds infrastructure,
  weakens offline use and removes repository-local auditability.

## Reversal cost

Medium. A new storage contract can supersede this record, but existing UUID
links and immutability checks must remain readable or be migrated explicitly.
