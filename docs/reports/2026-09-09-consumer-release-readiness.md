# Consumer release readiness

Status: local candidate and packed consumer verification passed; cross-platform
CI follow-up and human release gates remain open after cleanup.

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
of that unused module and its two dedicated tests was approved by Folpe on
September 9 and executed as Remove Dead Code. The real journal and its exclusion
tests are preserved. This was not a demonstrated defect in the journal currently
called by evaluations. The removal is recoverable from Git history.

## Final local candidate evidence

On exact `f2d3be5b442a280ebde2589132750412b23e403c`, with a clean working tree:

- `pnpm verify` passed all 23 gates. The four lanes passed 4,915 tests without
  skips: CPU 2,320, filesystem 1,564, subprocess 1,001, network/browser 30.
  Typechecks, builds, generated-artifact checks and lint passed. Lint reported
  36 warnings and 903 infos; a passing gate is not pristine output.
- `pnpm conformance:consumer` packed that checkout and passed install, hooks
  and autopilot against the same artifact on macOS. Hook coverage included
  Claude, Codex and both; autopilot covered Claude and Codex. The install
  suite observed a 1,325 ms p50, not a cross-platform performance guarantee.
- These isolated consumer fixtures make no paid model calls. They establish
  packaged contracts, not live provider permission enforcement.

Logs: `/private/tmp/release-readiness-corrected-verify.log` and
`/private/tmp/release-consumer-f2d3be5b.log`. Earlier failed logs remain failed;
this result follows the documented root-cause corrections, not a blind retry.

Native independent reviewers covered the cumulative production/documentation
diff and evaluation tests, including the cost correction. Their scoped reviews
are not one fresh-context whole-union certification. The previously closed
degraded mission remains degraded; it has not been recreated to override its
runtime-attestation limits.

## Pre-flight disposition

1. Typecheck: passed in the full candidate run.
2. Tests: passed after the last code change, plus packed consumer conformance.
3. Lint: passed with the diagnostics above.
4. Coverage: the earlier measurement remains below the installed strict default;
   no new coverage measurement or doctrine exception is claimed. Behavioral
   regression evidence and consumer conformance are recorded independently.
5. Hooks: passed on the correction commits; the documentation commit must pass
   its own hooks and affected verification gates.
6. Mobile/desktop screenshots: not applicable to this release-readiness delta;
   no rendered UI changed. CLI consumer flows were exercised instead.
7. Observability: no new side-effecting production path in the correction; the
   pure report now preserves unknown costs rather than understating them.
8. Security: independent cumulative boundary review found no additional live
   defect; the unused lease advisory is resolved by approved removal. Remote branch
   protections were read, not altered. No full administrative audit is claimed.
9. Documentation: runbook separates consumer release from paid activation;
   this report owns integration and failure adjudication evidence.
10. Commits: correction commits include conventional subjects, rationale and
    AI co-author trailers; versions and lockfiles were not hand-edited.
11. Review: scoped native review evidence will accompany the draft PR; pending
    disposition and runtime-isolation limitations prohibit a blanket approval.
12. Scope: existing evaluation plan/spec links remain in `docs/EVAL-RUNBOOK.md`;
    this report covers the explicit consumer-readiness request, not a new
    provider-backed work-unit selection or an approved paid campaign.

Ubuntu and Windows consumer results must come from this candidate's new CI,
not the old merged PR. Promotion to main, the release-please merge and checks
of the published npm artifact remain human-gated release work.

## Pre-release dead-code pass (September 9)

Folpe approved removal of the unused lease and requested a broader cleanup.
The pass combined TypeScript `--noUnusedLocals --noUnusedParameters` diagnostics
with bounded native source reviews, repository reference searches, package
exports, npm entrypoints, dynamic loaders and the current runbook. This is not
a proof that every possible dead path has been eliminated.

Removed, as **Remove Dead Code**, without changing active behavior:

- The private PID lease and its two self-tests, as described above.
- Private mission helpers `implementationBaseHead` and `currentHead`, obsolete
  since the stored review baseline became authoritative.
- CLI-internal `projectDerivedIgnoreEntries`, with no repository caller or
  public package export. The used ownership/migration functions remain.
- Unused `inconclusiveReview` factory; the refusal test still calls the real
  `judgeMergeGrant` with an inconclusive fixture and expects refusal.
- Graph-studio's abandoned `summarizeUsage` parser and its three self-tests.
  The active preparation script uses `summarizeActivations`, whose test remains.
- Compiler-confirmed unused imports and test bindings. The local-install
  fixture's awaited setup call remains; only its unused result binding is gone.

Retained deliberately: public `inferredProvenance`, active canonical journal
readers and governing-skill functions, consumer conformance scripts, and the
approved but unarmed evaluation composition (runtime pilot, consumer adapters,
sizing, blind review and report contracts). Tests-only reachability does not
make an explicitly owned capability abandoned. No dependency, lockfile,
configuration, immutable decision or permission was changed.

One candidate remains: graph-studio's `render/camera.ts` has no discovered
runtime caller and current camera ownership lives in `graph.ts`, but the
installed TDD hook refused deletion because it has no sibling test. It remains
unchanged; no dummy test or alternate deletion mechanism bypassed that refusal.
Historical plan examples are not live entrypoints. No active UI path changed.

Before the lease removal, the exact previous HEAD `fd8a2d29` had nine green CI
checks including the same packed artifact on all three operating systems.
After lease removal, the 158 remaining autonomous-value tests pass. The stricter
unused-symbol diagnostic initially found 15 CLI/hook-runner diagnostics, not
failures of the repository's normal typecheck gate. After the cleanup, the
workspace-wide diagnostic passes without changing TypeScript configuration.
Fresh post-cleanup full-suite and packed consumer evidence must replace the
earlier candidate proof before this branch is considered verified again.

Scoped post-cleanup evidence: 158 evaluation tests, 229 CLI/hook tests and
76 additional union-review/summary tests pass. The final unused-symbol command
passes across all workspaces; `pnpm derive` reports artifacts already current.
Scoped lint passes with one warning and nine infos, not pristine output.
Independent cleanup review found no active behavior or public API loss; its
remaining evidence request is the fresh full and packed proof.

Logs under `/private/tmp/`: `release-dead-code-eval.log`,
`release-dead-code-cli-tests.log`, `release-dead-code-additional-tests.log`,
`release-dead-code-unused-workspaces-final.log`, `release-dead-code-derive.log`
and `release-dead-code-lint.log`.
