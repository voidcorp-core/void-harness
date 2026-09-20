---
title: Optimize measured test costs without weakening proofs
date: 2026-09-16
status: approved
ticket: DEV-844
---

# Measured test cost optimization

Folpe explicitly requested this ticket and its implementation first in a seven-ticket
batch after reading the [audit](../audits/2026-09-16-test-performance.md).
The request authorizes the measured improvements below, not weaker safety or tests.

## Outcomes

Reduce repeated work and resource pressure while retaining every behavior invariant.
Keep the existing test tiers, isolation and bounded resource classes. Compare the
same commands before and after on identified trees; record wall time, CPU, sampled
aggregate RSS, process counts, test inventory and ambient-load limitations.
The earlier audit is evidence of candidates, not a comparable baseline for a new run.

## Scope

- Fuse the two identical real Semgrep scans, preserving vulnerability and non-mutation assertions.
- Classify tests that indirectly launch Node as subprocess work.
- Prepare immutable Git topologies once, then copy an independent mutable repository per scenario.
- Move duplicated decision matrices to their lowest faithful owner only if real stdin,
  exit status, stderr, malformed input, concurrency and resume integration proofs remain.
- Profile import/collection overhead before proposing any change to that layer.

Primary anchors: packages/cli/src/lib/security/owasp-fixture.test.ts,
packages/core/enforce/ci-enforce.test.ts, test/workflows/promotion-integration.test.ts,
test/cli/force-preserves-co-owned.test.ts, packages/hook-runner/src/cli.test.ts,
scripts/test-catalog.ts and its actual classifier/test collaborators. Declare exact
additional paths before editing. Keep a table of invariant -> surviving proof owner.
The implementation may reject an optimization whose measurements show no improvement.

## Invariants and limits

No skipped tests, retries, timeout increases, weakened assertions, shared mutable Git
state, result caches, daemons, dependency/version changes or blanket loss of isolation.
Do not shrink the 27-repository resume matrix just because it is slow. Failures stay
in the evidence; a diagnostic repeat never replaces a red acceptance run with green.
Fixtures clean up on failure; platform, symlink and whitespace behavior stays covered.
Do not claim sampled process RSS measures total Mac pressure or exclusive per-test CPU.

DEV-821 owns the already-delivered proof topology; DEV-561/591 record earlier contention
investigations. DEV-844 owns the newly measured repetition within that topology.
DEV-662 separately owns the shipped hook runtime cost. Their CLI test anchors overlap,
so those edits and measurements must be sequenced, never run against a changing tree.

## Acceptance and delivery

Publish reproducible before/after measurements for retained changes and an honest
result for total suite cost. Preserve the full collected invariant inventory despite
merged duplicate test cases. Run targeted tests while developing, then the complete
required gates once on the integrated tree. Review architecture of proofs, security,
QA and performance through void-implement. Link the final report and exact SHA to the PR.
No arbitrary percentage target or improvement claim without a measurement.
