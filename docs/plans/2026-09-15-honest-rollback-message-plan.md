---
title: Honest install failure after layout repair
date: 2026-09-15
spec: docs/specs/2026-09-15-approved-six-ticket-cluster.md
---

# DEV-645: preserve the failure boundary

The approved remainder changes the init failure message only. Update repairs the
legacy layout before invoking init; the install catch also covers work after
publication. A global byte-for-byte restoration claim therefore exceeds what the
catch knows. Existing transaction rollback and accepted fingerprint policy stay
as implemented.

## Implementation and proof

1. Extend the existing consumer transaction suite with real update: seed legacy
   state.json, replace installed PHILOSOPHY.md with a directory, and observe exit
   1, the original unowned conflict, removal of the legacy source and exact bytes
   at machine/status.json. Require the positive explanation that repair persists.
2. Commit the observed failing regression, then correct only the catch wording
   and document the layout/transaction boundary in ARCHITECTURE.md.
3. Run the affected init, update, manifest, local-install, hydrate and co-owned
   consumer suites. Preserve managed restoration, divergence detection, missing
   co-owned file detection, customizations and recorded fingerprints.
4. Build the local CLI and run it in a disposable consumer outside the unit
   runner. Record nonzero update, original error, migrated and managed bytes,
   repeat failure to verify idempotence, then remove the intentional conflict and
   prove hydrate succeeds after project customization.

The coordinator owns fresh independent review, integration verification, tracker
state and publication. This plan is a bounded implementation contract, not a
claim that those delivery gates have completed.
