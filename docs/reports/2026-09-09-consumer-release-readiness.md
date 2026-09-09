# Consumer release readiness

Status: integration prepared; final candidate and consumer verification pending.

## Candidate scope

The requested release includes the local evaluation/context work through
`b4f690bb` and the consumer fixes on fetched `develop` at
`322702d24ea00e0f8294759632818f426b8d06f6`. The former branch's PR #331 was
already merged on September 5; its green checks do not cover this candidate.
There were 102 local-only and 41 develop-only commits before integration.

Integration is isolated on `folpe/release-consumer-readiness-2026-09-09`; the
original branch is retained. No lockfile or version field is changed. No
existing accepted decision is rewritten, and no paid adapter is enabled.

## Conflict disposition

- `mission.ts` retains develop's single stored review baseline and canonical
  content binding, rather than retaining the superseded writer-local baseline.
- `controller.ts` retains develop's preparation receipt/action binding and
  rejection of late preparation reviews. Degraded runtime evidence remains
  degraded; unavailable runtimes still refuse.
- Tests retain the local full-panel-after-correction regression, first review
  after a real implementation commit, and repeated writer receipt idempotency,
  together with develop's staging/commit/content-change and preparation proofs.
- The approved local programme handoff DEV-835 through DEV-840 and human gates
  DEV-838/840 are preserved; no tracker state is inferred or changed.
- Catalogues, graph bundle and mirrors are regenerated from merged sources via
  `pnpm derive`, not manually resolved.

A read-only independent integration audit confirmed these resolutions. The
first contract run passed 89 tests and failed one: the earlier implementation
commit left no staged content for the later reviewed-content commit. Staging the
already-reviewed preparation document retains a genuine second content commit
and preserves both regression proofs. No empty commit or assertion removal was
used. The corrected four suites pass all 90 tests; CLI and mission-engine
typechecks pass. The local contract log includes two macOS/Xcode cache diagnostic
lines, not pristine output; no test warning is relabelled absent.

Logs: `/private/tmp/release-integration-contracts.log` (failed) and
`/private/tmp/release-integration-contracts-fixed.log` (passing).

## Evidence boundary

Before integration, all 23 gates passed on exact `b4f690bb`:
`/private/tmp/release-readiness-b4f690bb-verify.log`. That result is a baseline,
not verification of this merged candidate. Fresh full verification and packed
consumer conformance must follow the integration commit.

The remote `develop` protection was read on September 9: strict required checks
are validate, enforce, and install conformance on Ubuntu, macOS and Windows;
administrator enforcement is enabled. No open PR targeted develop at that read.
These observations are not a check result for the new integration branch.

The runbook now separates consumer publication from paid campaign activation.
Consumer readiness requires the protected release chain and actual packed
installation evidence. Provider spending caps, validated grading, live runtime
enforcement and a newly approved canary remain separate, unproven capabilities.
Neither the installed strict coverage default nor a percentage substitutes for
those guarantees; no doctrine exception is silently granted here.

Promotion, release-please merge and public publication verification remain
required before calling the version released. No publication or merge to a
remote base has been performed by this work.
