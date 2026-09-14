---
schemaVersion: 1
id: "adr:0ee50693-062d-4eb8-b870-840ef6453879"
createdAt: "2026-09-14T09:07:12.486Z"
title: "Distinguish committed enforcement from tool-write ownership"
status: accepted
deciders: ["folpe"]
supersedes: []
---

# Distinguish committed enforcement from tool-write ownership

## Context

Promotion PR #350 has passing build and test CI but fails the separate enforcement
floor. Its committed installer output and co-owned project files appear in the
installation manifest. The protected-file rule treats them as attempted tool
writes even though the CLI adapter already marks this evidence as checked-out.
Consequently a legitimate installer refresh cannot pass the promotion gate.

## Decision

Use the existing evidence-source boundary: manifest ownership prohibits tool-input
writes, while checked-out CI evidence receives lexical protected-path checks and
all subsequent content checks without the pre-write ownership prohibition.

Secrets, credential filenames, private keys and Git metadata remain refused.
Lockfiles retain the existing CI warning and dependency-validation policy. The
local tool-write rule retains manifest protection. No path is added to the
all-checks allowlist, no branch-specific exception is introduced, and the source
reader's 64 KiB bound is unchanged.

## Consequences

Positive:

- Reviewed installation changes can be promoted while leaked content still fails.
- A manifest entry cannot hide a stronger lexical refusal in CI.
- The same rule implementation serves both boundaries with their actual evidence.

Negative:

- A committed diff cannot prove who authorized an installation or doctrine change.
  Human review owns that authorization; this check must not claim installer
  provenance or installation integrity. Those have their existing owners.

## Alternatives considered

- Add the five paths to the current allowlist: rejected because it skips content
  scanning as well as the ownership prohibition and would hide leaked secrets.
- Downgrade the delivered-asset error string: rejected because manifest ownership
  currently precedes lexical checks, concealing stronger refusals for a manifest
  entry that names a secret or key.
- Authenticate installation with hashes from the same PR's manifest: rejected
  because author-controlled hashes do not establish trusted provenance and shared
  project files legitimately change after installation.

## Reversal cost

Low. Restore ownership checks for checked-out evidence in the existing runner
branch, update the paired regression tests, and regenerate the portable bundle.
No persisted schema, public CLI option or runtime configuration changes.
