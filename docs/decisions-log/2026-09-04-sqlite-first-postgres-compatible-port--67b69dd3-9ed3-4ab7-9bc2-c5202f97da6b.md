---
schemaVersion: 1
id: "adr:67b69dd3-9ed3-4ab7-9bc2-c5202f97da6b"
createdAt: "2026-09-04T10:06:08.775Z"
title: "Use SQLite first with a Postgres-compatible storage port"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Use SQLite first with a Postgres-compatible storage port

## Context

Void Machine is local-first and must run without an account, daemon or network. The user already
uses Neon in other projects, and future multi-host execution needs Postgres semantics, but requiring
a remote database would make the first local action depend on external availability.

## Decision

Use bundled SQLite as the first authoritative store behind a conformance-tested storage port, then
add Postgres and Neon as the first remote adapter.

SQLite uses explicit transactions, foreign keys, WAL, strong synchronization and one dedicated
blocking writer thread. One run has one authoritative store. The future Postgres adapter uses row
leases with fencing tokens and a transactional outbox; it does not rely on session advisory locks.

## Consequences

Positive:

- Fresh installs work offline with no service provisioning.
- The same domain contracts can later support Neon without cloud concepts entering the kernel.

Negative:

- The storage conformance suite must hold two SQL implementations to identical observable behavior.
- Multi-host execution is deferred until the Postgres adapter exists.

## Alternatives considered

- **Require Neon/Postgres**: rejected because an account, network and remote incident would become
  prerequisites for local work.
- **Embed a local Postgres server**: rejected because installation and process operations outweigh
  its value for a single-machine control plane.
- **Generic `Repository<T>` abstraction**: rejected because it hides transactional boundaries and
  encourages persistence semantics to leak into the domain.

## Reversal cost

**Medium.** A new store is bounded by the port, but it must pass concurrency, outbox, migration and
crash conformance before it can hold authority.
