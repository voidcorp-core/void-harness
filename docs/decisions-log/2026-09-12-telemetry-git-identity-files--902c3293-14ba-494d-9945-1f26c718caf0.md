---
schemaVersion: 1
id: "adr:902c3293-14ba-494d-9945-1f26c718caf0"
createdAt: "2026-09-12T17:25:23.640Z"
title: "Verify linked telemetry through documented Git identity files"
status: accepted
deciders: ["Folpe"]
supersedes: ["adr:ac9b4cdb-b4e2-44d4-8864-46981ff62296"]
---

# Verify linked telemetry through documented Git identity files

## Context

DEV-738's concurrent native-hook regression reproduced discovery deadline
exhaustion with nine hooks across two worktrees. Spawning three Git processes
per event consumes the bounded discovery budget under ordinary contention.
Increasing the deadline would hide the cost and violate the project's fail-fast
direction. Nested policy roots must also remain separate from repository identity.

## Decision

Verify ordinary linked repository identity through Git's documented gitfile,
commondir and reciprocal gitdir files, retaining bounded Git inspection only for
layouts whose main working tree cannot be established from that identity chain.

All pointer reads are bounded to 4096 bytes and reject symlinks, embedded line
breaks and empty values. Canonical paths must prove the reciprocal worker link,
the common directory's worktrees membership, and the main checkout's .git
directory identity. Malformed evidence refuses telemetry. No files in Git's
administrative directory are modified. Submodules and separate Git directories
retain the Git-query path and its aggregate 100 ms budget.

Policy configuration never terminates repository discovery; an independent
installation receipt still does. Explicit root compatibility, local enforcement,
payload-free failure diagnostics, and normal released-hook adoption remain as
defined by the superseded decision.

## Consequences

Positive:

- Ordinary concurrent workers require no Git subprocess or launch override.
- The same durable destination survives nested configurations and worker removal.

Negative:

- This boundary reads a small documented part of Git's administrative layout.
- Unusual layouts can still refuse when bounded Git inspection is unavailable;
  an enforcement success never proves telemetry conformance in that case.

## Alternatives considered

- Increase subprocess timeouts: rejected because contention becomes hook latency.
- Cache an unverified main path in each worker: rejected because moves and stale
  pointers could silently redirect evidence.
- Parse Git configuration and submodule worktree settings ourselves: rejected;
  Git remains the authority for those exceptional layouts.

## Reversal cost

Medium. The telemetry boundary and CLI exports remain compatible, but replacing
the metadata path requires a measured alternative with equivalent identity proof.

## References

- https://git-scm.com/docs/gitrepository-layout (gitfile, commondir, worktrees/gitdir)
- https://git-scm.com/docs/git-worktree
- docs/plans/2026-09-12-worker-telemetry-roots.md
