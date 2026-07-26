---
schemaVersion: 1
id: "adr:0eb524e6-9cc5-4ba1-898b-ab454c8ef2bc"
createdAt: "2026-07-24T17:47:38.661Z"
title: "Prefer bundled local runtime assets with receipt-backed transactions"
status: accepted
deciders: [Folpe]
supersedes: []
---

# Prefer bundled local runtime assets with receipt-backed transactions

## Context

The public npm install promises an account-free harness for Claude Code and
Codex. A marketplace-first Claude path required GitHub reachability and a
runtime-managed cache, while direct writes could leave partial policy after a
failure. Native project directories exist for both runtimes, and parallel user
assets must survive upgrades and removal.

## Decision

Bundle all runtime dependencies and authored assets in the npm tarball; compile
them by default into native project-local surfaces through adapters; stage,
smoke and publish them with byte-restoring transactions and hash-based ownership
receipts. Keep the Claude marketplace behind `--source marketplace`.

## Consequences

Positive:

- Claude and Codex install offline without a void-harness account, GitHub auth or
  global plugin state.
- Executable postconditions run before publication.
- Rollback restores bytes and modes; removal can target only receipt-owned,
  unchanged files.
- Runtime-specific compilation remains replaceable behind one adapter seam.

Negative:

- The CLI bundle grows because runtime dependencies are embedded.
- Native assets are materialized into the repository and must be refreshed by
  the CLI.
- A pre-existing conflicting native asset requires explicit `--force`; force
  does not seize deletion ownership.

## Alternatives considered

- Marketplace-first Claude installation: rejected as the default because it
  adds network, account/cache state and cannot prove materialization during
  `init`; retained as opt-in.
- Runtime-global installation: rejected because it breaks project isolation and
  reproducibility.
- Direct in-place copy with best-effort directory cleanup: rejected because it
  cannot restore modified shared files byte-for-byte.

## Reversal cost

Medium. The adapter seam can target another native or plugin channel, but
receipt-aware migration is required for already materialized files.
