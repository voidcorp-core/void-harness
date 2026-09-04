---
schemaVersion: 1
id: "adr:9da29673-e02c-4800-82ba-9cadc53e79f8"
createdAt: "2026-09-04T10:06:08.964Z"
title: "Store machine-local state outside the repository"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Store machine-local state outside the repository

## Context

Runs, proofs, receipts and indexes are machine observations rather than portable project intent.
Keeping them under the repository dirties normal work, risks accidental commits and gives each Git
worktree a competing copy. Committing them would also mix local process identity with shared state.

## Decision

Store machine-local state in the operating system's native state and cache directories, keyed by
the canonical Git common-directory identity.

Only desired policy, the exact installation lock, project doctrine, knowledge and route policy stay
under `.void/`. `void-machine paths` exposes every resolved location, and repository moves require
an explicit history-aware rebind.

## Consequences

Positive:

- All worktrees share one fenced authority without dirtying the repository.
- Local data follows operating-system conventions and can be backed up or removed independently.

Negative:

- Moving or recloning a repository requires discovery or explicit rebinding.
- Support diagnostics must bridge repository paths and an external state directory.

## Alternatives considered

- **`.void/local/` ignored by Git**: rejected because worktrees still receive separate directories
  and can claim the same run independently.
- **Committed `.void/machine/` state**: rejected because process state, receipts and derived indexes
  are not portable source and would create merge conflicts.
- **One global unkeyed database**: rejected because repository lifecycle, export and repair would be
  opaque and collisions harder to diagnose.

## Reversal cost

**Low.** The storage port and repository identity type isolate the location; migration copies one
local database and updates its binding without changing portable contracts.
