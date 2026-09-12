---
schemaVersion: 1
id: "adr:bc240039-e596-4e8e-9636-a6df780aecd5"
createdAt: "2026-09-12T13:52:12.204Z"
title: "Keep the Linear idea index in source maintenance only"
status: accepted
deciders: ["Folpe"]
supersedes: []
---

# Keep the Linear idea index in source maintenance only

## Context

Backlog discussions repeatedly contain decisions that later sessions rediscover.
Folpe approved the source-only index specification on 2026-09-12 and explicitly
excluded consumer projects. Linear data must not enter this public repository's
published product or its build inputs.

## Decision

Keep a disposable local projection in the private source workspace, collected
through the connected Linear runtime and rendered by an offline maintenance command.

## Consequences

Positive:

- Descriptions, discussions and provenance remain searchable without a second tracker.
- Generations publish atomically; invalid or stale exports cannot silently replace state.
- No new service, credential, consumer dependency or installed hook is required.

Negative:

- External edits become visible on explicit refresh, not through a background watcher.
- The connected maintainer performs collection and incremental refresh after writes.
- Previous generations occupy local disk until explicitly discarded and reconstructed.

## Alternatives considered

- A hand-maintained index drifts and omits the detailed discussions it is meant to recover.
- A webhook/vector service adds operations and another store without a demonstrated need.
- Shipping the indexer to every consumer violates the explicitly approved ownership boundary.

## Reversal cost

Low. Delete the local projection and maintenance command; Linear and approved
project documents remain autonomous. A new collector can reuse the versioned export.
