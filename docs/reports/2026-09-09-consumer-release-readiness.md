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

## Integrated gate failure: filesystem timestamp precision

The full run on `a2edd05b` failed its filesystem lane, not production lock
recovery: a fixture expected `1788940746836` milliseconds exactly but macOS
returned `1788940746835.999`. A separate real-file probe reproduced the same
delta (`-0.0009765625` ms) using that exact timestamp. Node documents
[platform-specific stat timestamp precision](https://nodejs.org/api/fs.html#stat-time-values).

The fixture now chooses whole-second timestamps, keeping the exact equality,
stale-old-observation assertion, fresh-lock refusal, ownership preservation and
recovery-fence cleanup assertions unchanged. No tolerance, timeout, retry or
production change is introduced. All 36 context-continuity executor tests pass:
`/private/tmp/release-context-lock-fixed.log`. Failed full-run evidence remains
`/private/tmp/release-readiness-a2edd05b-verify.log`; a new full candidate proof
is still required.

## Review correction: uncertain total cost

Independent review found that rendering only completed execution costs could
label zero or a subtotal as the campaign's known total. RED commit `d7a0eb12`
reproduces four cases: missing, interrupted, blocked and entirely unobserved
executions; the fully known campaign is a positive control. The correction
keeps total cost unknown if an entry is not completed or has unknown cost.
This affects reporting only, not retained budget reservations or admission.
All 160 autonomous-value tests pass after correction, with eval typecheck:
`/private/tmp/release-cost-green.log`. Reproducing failures remain in
`/private/tmp/release-cost-red-contract.log`. An earlier draft used the wrong
rendered heading and is not the accepted RED evidence.

The reviewer also identified an unused competing PID lease with unsafe recovery
of incomplete records. Repository search finds no production caller of
`acquireCampaignLease`; the real journal uses its own directory claim. Removal
of that unused module was proposed to Folpe and is awaiting disposition. It is
not a demonstrated defect in the journal currently called by evaluations.
