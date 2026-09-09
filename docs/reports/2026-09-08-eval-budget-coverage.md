# Durable budget coverage and runtime attestation

Status: measurement completed; certification remains partial.

## Observed coverage

Source: `6ccd429509e08830a7e9570d7e220fa03c1ae5e5`, clean before measurement.
The three implementation files are unchanged from the fully verified `d6aeef47`.
No production code, test, dependency manifest or lockfile changed for this run.

The actual Vitest V8 provider measured the three implementation files using
their three existing test files. All 47 tests passed, with no skips. No new
coverage exclusion or ignore annotation was introduced.

| File | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| budget.ts | 97.61% | 96.36% | 100% | 100% |
| durable.ts | 91.44% | 89.60% | 100% | 96.06% |
| runtime-pilot.ts | 88.88% | 88.67% | 100% | 95.55% |
| Total | 228/248 (91.93%) | 212/233 (90.98%) | 36/36 (100%) | 202/209 (96.65%) |

This lifts the missing-measurement limitation, not the strict 100% threshold.
Examples of genuinely missing tests include invalid configuration/adapter
identities, malformed recovered metrics, invalid archive states and missing
condition skills. They must not be relabelled unreachable.

Two defensive branches in `budget.ts` are structurally unreachable for valid
ordinary inputs: the failed safe-integer check after bounded exact conversion
(line 32), and a missing reservation after validating 27 unique matching entries
(line 58). Do not fake their execution by mocking pure collaborators or hide
them with an exclusion. Their disposition needs an explicit structural choice
or an approved coverage exception; neither is granted by this report.

## Instrument and reproduction

The repository does not install the coverage provider. The diagnostic instrument
was installed outside the repository in `/private/tmp/void-eval-coverage.KZIY6f`,
with no lockfile, install scripts or audit submission:

```sh
npm install --prefix /private/tmp/void-eval-coverage.KZIY6f \
  --cache /private/tmp/void-eval-coverage.KZIY6f/npm-cache \
  --no-save --package-lock=false --ignore-scripts --no-audit --no-fund \
  --fetch-retries=0 --fetch-timeout=20000 \
  vitest@4.1.9 @vitest/coverage-v8@4.1.9
```

Observed instrument: Vitest 4.1.9, coverage-v8 4.1.9, resolved Vite 8.2.2.
The repository's Vite is 8.1.3. This is a separately identified diagnostic
environment, not a replacement for the repository's release verification.
Its transient dependency tree is not a committed CI installation contract.
The restricted environment could not resolve npm; only the public tool download
used explicit network approval. No model endpoint or credential was involved.

From the repository root:

```sh
node /private/tmp/void-eval-coverage.KZIY6f/node_modules/vitest/vitest.mjs run \
  apps/eval-harness/src/autonomous-value/budget.test.ts \
  apps/eval-harness/src/autonomous-value/durable.test.ts \
  apps/eval-harness/src/autonomous-value/runtime-pilot.test.ts \
  --coverage.enabled --coverage.provider=v8 \
  '--coverage.include=apps/eval-harness/src/autonomous-value/{budget,durable,runtime-pilot}.ts' \
  --coverage.reportsDirectory=/private/tmp/void-eval-coverage.KZIY6f/report \
  --coverage.reporter=text --coverage.reporter=json --coverage.reporter=json-summary
```

Local artifacts:

- log: `/private/tmp/void-eval-coverage-run.log`;
- summary: `report/coverage-summary.json` under the instrument directory,
  SHA-256 `799d651550f5602492cdd2b3e0d02f35409f0009e67146e2ef20c77282169b73`;
- statements and branch locations: `report/coverage-final.json`,
  SHA-256 `b34aea5cea5e0f9931720c5530f5cae2e67d3185cdd04f80b521324ab13c0bc0`.

The version-matched [Vitest 4 coverage guide](https://v4.vitest.dev/guide/coverage)
documents the optional V8 provider and explicit source inclusion. The
[npm 11 install reference](https://docs.npmjs.com/cli/v11/commands/npm-install/)
documents disabled lockfile writes and install scripts. Temporary artifacts can
expire; this versioned summary preserves the observed outcome, not their bytes.

## Runtime boundary

The installed CLI probe reports Codex 0.145.0. The current official
[Codex subagent documentation](https://developers.openai.com/codex/multi-agent)
confirms that children inherit the parent sandbox and that live parent runtime
overrides are reapplied even when agent configuration declares other defaults.
The native delegation tool exposed in this session has no per-agent tool/process
allowlist or attested read-only permission parameter.

Consequently, the existing degraded result is not a constant to flip. A new
review environment must enforce the allowed tool surface and effective read-only
permissions independently of reviewer instructions. The required enforcement
and runtime probes must be observed there before its certification can change.
PDF/browser probes remain unproven; neither is required to measure these three
TypeScript files. No new mission was opened to bypass the closed verdict.

Next: cover the reachable refusal paths, explicitly dispose of defensive
unreachable branches, and obtain an enforceable review environment. No paid
provider, canary, production activation, publication or merge is authorized here.

## Behavioral follow-up, 2026-09-09

The next increment adds 17 cases to the existing durable/runtime test owners;
production code, dependencies, coverage exclusions and doctrine are unchanged.
These are characterization tests, not a newly claimed production RED/GREEN cycle.
The user challenged treating 100% as a universal release requirement. This work
uses the measurement to locate consequential gaps, not to remove defensive code
or manufacture execution of unreachable branches. The installed strict skill's
default is unchanged; this report does not silently grant a doctrine exception.

New observable proofs:

- invalid configuration, adapter, approval, policy and reservation identities
  refuse before authority creation or effects;
- malformed recovered duration/cost metrics never become a score, never replay
  the recorded execution and retain its reservation;
- an unknown archive state refuses without replacing the corrupted record;
- invalid runtime identities and duplicate reservations refuse before task
  loading, authority creation or execution;
- a missing condition skill stops at the first blocked cell: three preceding
  agent-alone cells execute, the blocked reservation stays consumed, later cells
  have no archive, and resuming executes nothing new. The report still has all
  27 slots, with synthetic unknown observations after the stop.

Verification: 210 tests pass across 20 files (149 autonomous-value tests and 61
runtime/compiler/controller tests), no skips; eval-harness typecheck, targeted
Biome check and `git diff --check` pass. The test log is
`/private/tmp/eval-refusals-2026-09-09-verified.log`. Command:

```sh
pnpm exec vitest run apps/eval-harness/src/autonomous-value \
  packages/cli/src/lib/specialists/compile-claude.test.ts \
  packages/cli/src/lib/specialists/compile-codex.test.ts \
  apps/eval-harness/src/runtime/claude.test.ts \
  apps/eval-harness/src/runtime/codex.test.ts \
  packages/cli/src/lib/runtime-adapters.test.ts \
  packages/mission-engine/src/orchestration/controller.test.ts
```

Two preceding runs each failed one new test because its expectations confused
stopping execution with completing the schedule, then persisted records with
synthetic report slots. The test was corrected against `consumer.ts`; production
was not changed. Failed logs remain `eval-refusals-2026-09-09.log` and
`eval-refusals-2026-09-09-final.log` under `/private/tmp/`. This is not a retry
that turned unchanged failing assertions green. Coverage was not remeasured;
the percentages above describe the earlier 47-test instrument only.

The isolation investigation found an existing restricted Claude route:
`compile-claude.ts` emits a Read/Grep/Glob allowlist, and the eval runtime adapter
builds an invocation with explicit tools and noninteractive permission policy.
The passing local tests prove those emitted contracts and honest degradation,
not their enforcement by a live model process. No new wrapper or user-provisioned
environment is required to test these existing contracts. Live enforcement still
needs a separately authorized runtime probe; no paid process was started here.
The closed Codex mission remains degraded, and no runtime marker was changed.

Remaining gaps include canonical authority-path refusals and invalid manifest
identity. This increment does not claim exhaustive refusal coverage. Provider
cap enforcement, independent quality assessment and live tool enforcement remain
distinct from these local tests and from an arbitrary coverage percentage.

Review: native `refusal_test_review` inspected the test diff independently and
the final test log, then returned pass with no remaining findings. Its earlier
observation-count finding is resolved. This is a scoped WIP test-quality review,
not a new controller certification. Verification scope excludes UI, new business
logging and changed security boundaries because none changed. No new production
build, full-suite release proof, coverage measurement or PR publication is
claimed; the earlier full-suite proof remains bound to `d6aeef47`. The plan and
runbook are updated alongside the tests.

## Authority-path follow-up, 2026-09-09

Six additional characterization cases close the authority-path and invalid
manifest gaps named above, in the existing `durable.test.ts` suite:

- a missing root is not created automatically;
- a file or symlink cannot serve as the canonical authority root;
- a file or symlink occupying the approval-derived archive is refused, not
  overwritten or followed; the symlink target stays empty;
- an invalid manifest is refused before creating budget authority.

Each case observes zero execution callbacks and unchanged preexisting filesystem
content. Real temporary files and symlinks exercise the production journal;
there are no permission-bit tests whose result depends on running as root,
business mocks, coverage exclusions or production changes.

`pnpm exec vitest run apps/eval-harness/src/autonomous-value` passes 155 tests
across 14 files, no skips, on the test increment based on `e30488ee`.
Log: `/private/tmp/eval-authority-paths-2026-09-09.log`.
`pnpm --filter @voidcorp/eval-harness typecheck`, targeted Biome check and
`git diff --check` also pass. No failed attempt preceded this result.
Independent native review `refusal_test_review` inspected this increment and its
completed test log: pass, no findings or duplicate proof ownership identified.

This closes the two named local test gaps, not every possible storage failure
or a live-runtime certificate. Existing concurrency and sync-failure tests still
own those responsibilities. Hostile modification by the trusted archive owner,
physical power loss and provider/tool enforcement remain outside these proofs.
The earlier coverage values and full-suite evidence are not reissued for this
increment. No new runtime, paid call, publication or merge is authorized.
