---
schemaVersion: 1
id: "adr:d1ebefa6-e01c-4812-8eda-e2b7769fde28"
createdAt: "2026-09-04T10:05:58.501Z"
title: "Keep one history and strangle the legacy engine"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Keep one history and strangle the legacy engine

## Context

The repository already contains the published package, consumer fixtures, migration receipts,
skills, packs, accepted decisions and more than four thousand regression tests. Its current
TypeScript execution architecture is also the source of repeated authority and recovery defects.
A clean break would remove accidental coupling, but it would create two sources of truth and turn
consumer migration into a big-bang rewrite.

## Decision

Keep this Git history and build the native engine in an isolated `crates/` subtree, replacing the
legacy engine one vertical command at a time.

The native engine never imports the TypeScript mission engine. Both may read the same versioned JSON
fixtures, but only one is authoritative for a command in a release. The legacy implementation may
act as a read-only oracle until that command cuts over, then its production path is removed. The
last legacy release receives an immutable tag before the public repository rename.

## Consequences

Positive:

- Existing evidence, issue links, release history and consumer migrations remain usable.
- Each slice has a bounded rollback and proves compatibility before authority moves.

Negative:

- The repository carries Rust and TypeScript build systems during the migration window.
- Boundary discipline and explicit deletion criteria are required to prevent two engines living on.

## Alternatives considered

- **Start a new repository**: rejected now because it creates two products and loses the strongest
  regression corpus exactly when compatibility risk is highest. Extraction remains possible later.
- **Rewrite inside the existing packages**: rejected because new authority would be entangled with
  the defects it is meant to replace and rollback would be unclear.
- **Keep evolving the TypeScript engine**: rejected because it preserves the current runtime and
  distribution constraints instead of establishing the approved native boundary.

## Reversal cost

**Medium.** The isolated subtree and portable contracts can move to a new repository later, but
release automation, issue history and package ownership would need a coordinated transfer.
