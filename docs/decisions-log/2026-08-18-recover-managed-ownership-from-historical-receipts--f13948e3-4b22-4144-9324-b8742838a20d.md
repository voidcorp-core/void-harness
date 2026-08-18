---
schemaVersion: 1
id: "adr:f13948e3-4b22-4144-9324-b8742838a20d"
createdAt: "2026-08-18T17:12:35.672Z"
title: "Recover managed ownership from exact historical receipts"
status: proposed
deciders: ["maintainer"]
supersedes: []
---

# Recover managed ownership from exact historical receipts

## Context

The observed-state layout migration can park a previous install receipt beside
the active one as `install-v1.json.legacy`. A real 2.7.0 consumer then carried a
partial active receipt while the parked 2.5.1 receipt still described the exact
hash and mode of the managed files on disk. Updating to 3.0.0 consulted only the
partial receipt: an unchanged agent was rejected as unowned, and thirteen
renamed skills survived as orphans even though every byte still matched the
historical receipt.

Consumers that already forced the 3.0.0 update have a second gap: 3.0.0 wrote
changed assets but, correctly, did not claim a previously unowned file merely
because force was present. Their active 3.0.0 manifest records the exact new
content, but only the subset newly created by that update appears in its receipt.

The installer must recover its own missing ownership without turning a filename,
frontmatter shape, committed manifest, or `--force` into deletion authority.
Shared files such as `.void/config.json` remain project-owned even when an older
receipt schema listed them.

## Decision

During a local install transaction, treat valid parked install receipts as
additional ownership proof only for paths the active receipt omitted and only
inside the current managed boundary. When the active receipt lists a path, that
entry is authoritative; an older hash cannot become an alternate proof. Also
recover a missing same-path entry from the current manifest only when the active
receipt owns that manifest exactly, its version matches, the content hash
matches, and the current mode equals the staged mode. Only receipt proof can
authorize removal of a path the new install no longer stages.

## Consequences

Positive:

- Consumers with a partial active receipt update without a false unowned conflict.
- Consumers that already forced 3.0.0 rebuild a complete receipt on their next
  update without another force.
- Renamed assets that are still byte-for-byte harness output are pruned in the
  same transaction, including consumers already affected by 3.0.0.
- A local content or mode change still prevents deletion and remains visible as
  a preserved orphan.
- Restoring bytes from an older harness release counts as a local change when the
  active receipt already records a newer version of that path.
- Historical receipts cannot claim project-owned config, doctrine, or runtime
  settings because recovery is filtered through the current managed boundary.

Negative:

- Parked receipts remain semantically relevant after migration instead of being
  passive forensic artifacts.
- Each install reads the filtered receipt directory and may report a
  deliberately repurposed retired path as preserved on later updates.

## Alternatives considered

- **Use the committed install manifest by itself as recovered ownership.**
  Rejected: it does not record modes, can be edited by the project, and excludes
  itself by construction. Recovery therefore requires the active receipt to own
  the manifest, requires its version to match, borrows mode evidence from the
  staged file, and never uses the manifest for stale-file deletion.
- **Delete every harness-shaped orphan in `doctor --fix`.** Rejected: provenance
  frontmatter identifies likely origin but cannot prove that the body was not
  edited locally. Detection is not deletion authority.
- **Require `update --force` and let force claim the files.** Rejected: force is
  an overwrite instruction, not evidence of prior ownership. Claiming on force
  would let the next update delete a pre-existing project file.
- **Ignore parked receipts and ask for manual deletion.** Rejected: it transfers
  deterministic cleanup to every consumer while exact machine evidence already
  exists.

## Reversal cost

Low. Recovery is confined to the install transaction and does not change a file
format. Reverting means returning to the active receipt as the only proof; no
consumer state needs migration, though partial-receipt consumers would regain the
false conflicts and orphans.
