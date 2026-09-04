---
title: Void Machine foundation
date: 2026-09-04
status: in-progress
spec: docs/specs/2026-09-04-void-machine-foundation.md
ticket:
author: Folpe + Codex
high_risk: true
---

# Plan: Void Machine foundation

## Goal

Deliver the first native Void Machine release as a sequence of independently provable cutovers.
The release must install into an existing or fresh consumer repository, run the same skill through
the user's Codex or Claude Code subscription, own state and effects outside the model, recover
exactly after crashes and bounded human waits, and autonomously merge a verified cluster into
`develop` while making promotion to the deploying branch impossible.

The migration stays in this Git history. Existing TypeScript behavior is a versioned oracle and a
temporary compatibility shell, never a second long-lived authority.

## Delivery mode and scope control

This is a provider-backed programme, not one implementation ticket or one pull request. It is
deliberately in **REDUCTION** mode despite its ambition:

- each `VM-*` unit below gets one Linear issue, one bounded branch and one reviewable pull request;
- a unit is limited to two focused implementation days; it is split before execution if that bound
  is not credible;
- every cutover names the one authoritative engine before and after it;
- no slice may add a parallel production path without a removal or quarantine criterion;
- no unit moves to Done until its exact acceptance evidence exists on `develop`;
- tickets with overlapping footprints run sequentially; lockfiles, migrations, release metadata
  and shared contracts always run sequentially;
- the current `.void/program.md` is not replaced until this plan and its complete ticket pool are
  approved and the existing programme has been reconciled;
- `main` and any branch that deploys remain human-only throughout the programme.

The first value cut is Checkpoint A: a packed native binary executes one read-only skill through
both real subscription runtimes and emits a verifiable proof. No autonomous Git or remote write is
needed to prove that cut.

## In scope

- Native local control plane, CLI and updater in Rust.
- Portable skill packages formed by `SKILL.md` plus `harness.yaml`.
- Deterministic eligibility, optional semantic ranking and deterministic fallback.
- SQLite state, append-only episodes, outbox, leases, budgets and proofs.
- OS-native machine state keyed by canonical Git common-directory identity.
- Codex and Claude Code subscription process adapters.
- Git/worktree, GitHub/CI and Linear progress adapters.
- Bounded reversible recovery after a 15- or 20-minute human timeout.
- Managed `void-implement`, bounded `void-autopilot` and autonomous merge to `develop`.
- Exact project pins, current-consumer migration, signed updates and rollback.
- macOS, Linux and Windows release artifacts, shell and PowerShell installers, and an npm bridge.

## Not in scope

- Void Workbench UI.
- Postgres/Neon implementation; only the storage contract and conformance seam ship now.
- A third AI runtime, hosted control plane, multi-host scheduler or shared queue.
- A general LLM proxy, an embeddings service or a vector database.
- Automatic installation of untrusted third-party packs.
- A rewrite of every existing skill or pack.
- Autonomous production deployment or promotion to `main`.
- A repository split or public rename before the release certificate passes.

## What already exists and must be reused

| Existing asset | Reuse rule |
|---|---|
| `packages/mission-engine/src/` | Behavioral oracle for events, evidence, budgets, orchestration and resume. Port proven contracts; do not translate files mechanically. |
| `packages/cli/src/lib/autopilot/` | Oracle for selection, footprints, leases, review provenance, reconciliation and merge grants. Characterize before replacing each authority. |
| `packages/cli/src/lib/runs/` | Oracle for bounded evidence, redaction, inspection and archival. Preserve fixtures and negative cases. |
| `packages/cli/src/lib/runtime-adapters.ts` | Oracle for runtime discovery and materialization. Managed process execution becomes a separate native port. |
| `packages/cli/src/lib/receipts.ts` and install transaction code | Source of current consumer ownership and rollback behavior. Migration must preserve every user-owned collision case. |
| `packages/cli/scripts/conformance-*.mjs` | Cross-platform consumer and process fixture foundation. Native cases join this suite before replacing it. |
| `packages/core/skills/*/{SKILL.md,harness.yaml}` | Portable content source. The signed content index binds both halves as one package. |
| `test/skills/frontmatter-is-agnostic.test.ts` | Portability gate. Proprietary structured frontmatter remains forbidden. |
| `.github/workflows/ci.yml` and `release.yml` | Existing supply-chain floor. Native lanes extend it without weakening Node-era gates during migration. |

## Approved alternatives and reversal points

The accepted ADRs own these choices, so implementation does not reopen them without a superseding
decision:

| Chosen path | Rejected path | Reversal point |
|---|---|---|
| Same-history strangler | Clean-room repository | Split only if governance, ownership or release cadence actually diverges. |
| Small native Rust kernel | Extend TypeScript or run a mixed authoritative kernel | Reverse before VM-04 stores authoritative native state. |
| SQLite behind a storage port | Require Neon/Postgres for local use | Add Postgres only when multi-host operation becomes a shipping requirement. |
| Official runtime CLI processes | Provider SDK, token extraction or LLM proxy | Add an API adapter only under a non-zero budget and separate proof class. |
| Project pin plus TUF-rooted updater | Implicit latest-version activation | Replace only with a trust model that preserves rollback and freeze protection. |

Temporal, Kafka, Redis, Kubernetes and a vector database were also rejected for this local-first
release because they add failure domains without serving a v1 requirement.

## Target source topology

```text
contracts/machine/v1/       versioned JSON Schemas and compatibility fixtures
crates/
  void-machine-core/        pure domain, state transitions, policy, router, proof rules, port traits
  void-machine-host/        use cases and supervisor, generic over explicit ports
  void-machine-adapters/    SQLite, process, Git, GitHub, Linear, clock and filesystem adapters
  void-machine-updater/     isolated TUF verification, staging, activation and rollback boundary
  void-machine-cli/         Clap surface and the only composition root
conformance/machine/        consumer, crash, runtime, update and cross-version certificates
packages/core/              portable content source retained during the strangler migration
packages/cli/               compatibility launcher and legacy oracle until each cutover
```

Dependency direction:

```text
void-machine-cli -> void-machine-host -> void-machine-core
        |                   ^
        +-> adapters -------+
        +-> updater

legacy TypeScript -> fixtures/contracts only -> native implementation
native implementation -X-> legacy TypeScript production engine
```

`void-machine-core` owns the port traits it needs. The host receives implementations through
function parameters or small explicit constructors. There is no dependency-injection container,
service locator, mediator, plugin runtime or dynamic dispatch registry hidden behind macros.

The initial dependency set is intentionally small: pinned stable Rust edition 2024, Tokio, Clap,
Serde,
JSON Schema validation, TOML parsing, typed diagnostic/error crates, `rusqlite` and `tracing`.
SQLx and OpenTelemetry remain architectural seams and are not added until a shipping adapter needs
them. Auth, update and packaging configuration must be checked against the installed tool version
and current official documentation immediately before implementation.

Dependency resolution is a reviewed release input. Agents never hand-edit a lockfile, and a lock
change cannot share a commit with behavior unless the generated delta is explicitly reviewed.

## Cross-cutting engineering gates

Every production crate starts with `#![forbid(unsafe_code)]`. Production code may not use
`unwrap`, `expect`, `panic!`, unchecked indexing or process abort as ordinary control flow.

Every unit that touches Rust must pass:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo deny check
```

If a crate introduces features, CI enumerates every supported feature combination. It uses
`--all-features` only when enabling all features together is a supported product configuration.

Until the corresponding TypeScript authority is removed, the same unit also passes:

```sh
pnpm build
pnpm test
pnpm derive:check
```

Critical reducers use strict TDD plus model/property tests. Every pull request runs at least 1,000
pure, deterministically seeded transition/effect sequences and every finite crash point touched by
the change at least once; nightly certification runs at least 100,000 randomized sequences across
the supported platform matrix. Every failing seed is printed, stored with the certificate and
promoted to a permanent regression fixture before the fix.

Fault injection brackets every durable boundary: immediately before and after state commit,
outbox claim, provider call, reconciliation, proof seal, update journal write and activation swap.
For each point the certificate checks zero duplicated authoritative effects, zero false success,
the exact next valid resume action and unchanged permission, budget and recovery ceilings.

Public CI never receives subscription credentials. Real-runtime certification runs in a
maintainer-controlled environment, records no token or raw environment, binds the adapter, runtime
version, billing class, artifact digest and source SHA, signs the resulting attestation, and
publishes only the redacted certificate.
Missing or inconclusive real-runtime evidence blocks release; a mock result cannot substitute for
it. The certificate becomes stale when the adapter changes, the runtime version leaves its tested
compatibility range, the content package changes or the source SHA changes.

## Steps

### Step VM-01: Freeze the current consumer contract

- **Goal**: turn current install, update, doctor, skill and autopilot behavior into an executable
  legacy oracle before any authority moves.
- **Depends on**: none.
- **TDD mode**: souple for fixture wiring, strict for every newly characterized defect.
- **Files**: extend `packages/cli/scripts/conformance-install.mjs`,
  `packages/cli/scripts/conformance-process.mjs`,
  `packages/cli/scripts/conformance-autopilot.mjs`, and add versioned fixtures under
  `conformance/machine/legacy-v3/`.
- **Behavior**: capture fresh install, dirty user-owned collisions, update, rollback, Claude-only,
  Codex-only, both runtimes, worktree execution, interrupted run and exact-SHA CI cases. Store
  canonical expected outcomes, never machine-specific absolute paths or credentials.
- **Verification gate**: the fixtures pass from the current packed `voidharness` artifact on Linux,
  macOS and Windows, and at least one deliberately corrupted receipt fails with the expected code.
- **Expected commits**:
  - `test(machine): freeze the current consumer behavior before native cutover`
  - `test(machine): prove corrupted legacy state never passes as healthy`
- **Authority after**: TypeScript remains authoritative; native code does not exist.

### Step VM-02: Ship a native doctor through the compatibility package

- **Goal**: establish the Rust workspace and deliver a real, read-only consumer capability through
  a locally packed npm bridge.
- **Depends on**: VM-01.
- **TDD mode**: strict for path/config/diagnostic decisions, souple for CLI and packaging wiring.
- **Files**: add the core, host, adapters and CLI crate roots,
  `contracts/machine/v1/diagnostic.schema.json`, a version-pinned `rust-toolchain.toml`, dependency
  policy in `deny.toml`, native CI jobs, and a thin launcher under `packages/cli/` that invokes the
  staged native artifact only for `void-machine doctor`. The updater crate is not scaffolded until
  VM-16 needs it.
- **Behavior**: `doctor --json` finds the canonical repository and Git common directory, resolves
  OS-native state/cache paths, parses `machine.toml` and `machine.lock.json` if present, reports
  typed healthy/degraded/blocked findings, and performs no write. Human output names problem,
  cause and exact repair command.
- **Verification gate**: a packed consumer fixture runs the native doctor on all three platforms;
  malformed config, absent Git, linked worktree and read-only repository cases produce schema-valid
  deterministic diagnostics. Existing `voidharness doctor` remains byte-for-byte unchanged.
- **Expected commits**:
  - `test(machine): define native path and diagnostic contracts`
  - `feat(machine): deliver the native doctor through the compatibility shell`
- **Authority after**: native doctor owns only `void-machine doctor`; legacy doctor owns the old
  command.

### Step VM-03: Validate one portable skill package end to end

- **Goal**: make `SKILL.md` plus `harness.yaml` an exact, validated and pinned executable package.
- **Depends on**: VM-02.
- **TDD mode**: strict.
- **Files**: add skill/package schemas under `contracts/machine/v1/`, package identity and
  validation to `void-machine-core`, loading to `void-machine-adapters`, and content fixtures under
  `conformance/machine/skills/`.
- **Behavior**: bind the portable directory digest and manifest digest into one package identity.
  The directory digest is a canonical, path-sorted list of relative path, file type, executable bit
  and raw-byte digest; it performs no newline or Unicode normalization. Reject unknown fields, path
  escapes, symlinks, missing halves, stale halves, incompatible contracts, unknown capabilities and
  permissions. Compile one existing read-only skill without modifying its portable frontmatter and
  expose `void-machine skill check <path> --json`.
- **Verification gate**: `pnpm vitest run test/skills/frontmatter-is-agnostic.test.ts` and
  `void-machine skill check` pass for the materialized skill; every invalid fixture fails before
  execution with a stable error code; two byte-identical builds yield the same package identity.
- **Expected commits**:
  - `test(machine): reject incomplete or drifting skill packages`
  - `feat(machine): bind portable skills to executable manifests`
- **Authority after**: native validation owns Machine package eligibility; runtime-native skill
  discovery remains unchanged.

### Step VM-04: Complete a durable no-effect run and proof

- **Goal**: execute the validated read-only skill through the kernel state machine with durable
  resume and a complete proof, before introducing external writes.
- **Depends on**: VM-03.
- **TDD mode**: strict.
- **Files**: implement state, command, event, lease, budget, outbox and proof modules in
  `void-machine-core`; supervisor use cases in `void-machine-host`; SQLite in
  `void-machine-adapters`; crash fixtures under `conformance/machine/crash/`.
- **Behavior**: `void-machine run --skill fixture-read-only --json` validates a typed command at an
  expected revision, commits current state plus append-only event plus any outbox rows in one
  transaction, fences stale supervisors, and seals a canonical proof only when every absolute
  requirement is observed. SQLite writes run through one bounded dedicated writer thread so async
  cancellation cannot strand a transaction. The durability pragmas, bounded busy policy and
  recovery procedure are documented from the current SQLite reference and verified by the crash
  matrix before they become defaults.
- **Verification gate**: model tests cover every legal and illegal transition; 1,000 seeded crash
  sequences bracket every transaction point; kill-and-resume produces the same next action and
  proof digest; a worker success string can never complete the run.
- **Expected commits**:
  - `test(machine): model every durable run transition and crash boundary`
  - `feat(machine): own durable state and proof outside the model`
- **Authority after**: native state is authoritative for native runs only; no legacy run is
  imported or mutated.

### Step VM-05: Certify Codex subscription execution

- **Goal**: run the read-only skill under official `codex exec` using the user's existing ChatGPT
  subscription authentication without an API proxy.
- **Depends on**: VM-04.
- **TDD mode**: souple for process wiring, strict for auth classification, environment policy,
  protocol parsing, timeout and cancellation.
- **Files**: add the Codex process adapter and contract fixtures in `void-machine-adapters`, plus
  redacted real-runtime certification under `conformance/machine/runtimes/codex/`.
- **Behavior**: discover the official CLI, verify supported version and auth class, launch with a
  minimal allowlisted environment, runtime-native sandbox policy and platform process supervisor;
  parse bounded structured output, terminate the complete process tree on timeout, and report
  billing as observed or
  `unknown`, never guessed. An API path requires explicit policy, a positive budget and a
  worst-case reservation before launch; unknown price or usage refuses the call rather than
  spending against an unverifiable ceiling.
- **Verification gate**: process contract tests cover missing binary, logged-out, malformed output,
  oversized output, timeout and cancellation. A real adversarial probe attempts undeclared
  filesystem access, network access and a surviving child process; any successful escape makes the
  capability assisted-only on that platform. A real authorized subscription run produces a proof
  bound to the exact CLI and source SHA. With API ceiling `0`, every API route is refused before
  launch.
- **Expected commits**:
  - `test(runtime): define Codex subscription process failures`
  - `feat(runtime): supervise Codex subscription execution`
- **Authority after**: native host owns only Machine-launched Codex attempts; direct Codex remains
  assisted execution.

### Step VM-06: Certify Claude Code subscription execution

- **Goal**: run the same read-only skill under the official non-bare `claude -p` subscription path
  without copying credentials or silently switching to API billing.
- **Depends on**: VM-04. May execute in parallel with VM-05 after shared process contracts settle.
- **TDD mode**: souple for process wiring, strict for auth classification, environment policy,
  protocol parsing, timeout and cancellation.
- **Files**: add the Claude process adapter and fixtures in `void-machine-adapters`, plus redacted
  real-runtime certification under `conformance/machine/runtimes/claude/`.
- **Behavior**: launch the official CLI without `--bare`; let that CLI own OAuth/provider state;
  never read, extract, store or proxy its token; remove API/provider override variables from the
  child environment; verify subscription-compatible auth or refuse; and never fall back to the API
  silently. The Claude API budget defaults to exactly `0`; a non-zero API policy reserves the
  declared worst-case cost before launch and refuses unknown price or usage. Apply the same
  runtime-native sandbox and platform process-supervisor contract as the Codex adapter.
- **Verification gate**: contract tests cover API-key override, provider override, logged-out,
  ambiguous auth, malformed stream, timeout and process-tree cancellation. The same real
  filesystem, network and surviving-child escape probe must pass or the platform remains
  assisted-only. A real Claude Code subscription run produces the release certificate. If that
  certificate cannot be obtained, the unit and release stay blocked rather than substituting a
  mock.
- **Expected commits**:
  - `test(runtime): prevent Claude subscription runs from becoming API runs`
  - `feat(runtime): supervise official Claude Code subscription execution`
- **Authority after**: native host owns only Machine-launched Claude attempts; direct Claude Code
  remains assisted execution.

### Checkpoint A: prove the subscription-first product

Folpe installs the locally packed preview into a clean fixture and runs the same read-only skill
once with Codex and once with Claude Code. The proof must identify the skill package, runtime,
billing class and absent effects without exposing credentials. The path from an already logged-in
runtime to first result is at most two commands and five minutes, excluding artifact compilation.

Stop here. Run the full verification matrix and wait for Folpe's approval before any authoritative
Git or remote effect is enabled.

### Step VM-07: Route deterministically, then rank semantically

- **Goal**: select skills by executable eligibility first and use semantic judgment only to order
  the eligible set.
- **Depends on**: VM-04; real-runtime acceptance at Checkpoint A is required before release of the
  semantic adapter.
- **TDD mode**: strict for eligibility and fallback, souple for semantic process wiring.
- **Files**: add router policies to `void-machine-core`, semantic ranker ports to
  `void-machine-host`, runtime-backed rankers to `void-machine-adapters`, and routing fixtures under
  `conformance/machine/router/`.
- **Behavior**: filter requested capability, schemas, project facts, packs, runtime features,
  permissions, network, budget, compatibility and allow/deny policy. Record a typed reason for
  every rejection. The semantic adapter may return only eligible IDs; invalid, timed-out or absent
  ranking falls back to stable deterministic ordering. Ranking runs as a no-effect, read-only
  attempt over an immutable bounded context package.
- **Verification gate**: permutation/property tests prove an ineligible route can never be added by
  a ranker; fallback produces the same result on every platform; empty and ambiguous sets are typed
  outcomes. The delivered proof includes candidates, rejection reasons, scores and tie-break.
- **Expected commits**:
  - `test(router): semantic ranking can never widen deterministic eligibility`
  - `feat(router): explain and rank executable skill routes`
- **Authority after**: native router owns native managed selection; runtime-native assisted
  discovery remains explicitly unsupervised.

### Step VM-08: Separate project knowledge from rebuildable indexes

- **Goal**: make all five memory categories independently inspectable and prevent transcripts or
  caches from becoming authority.
- **Depends on**: VM-07.
- **TDD mode**: strict.
- **Files**: add memory contracts to `void-machine-core`, repository knowledge and cache adapters to
  `void-machine-adapters`, `.void/knowledge/` fixtures, and `memory inspect|rebuild` CLI surfaces.
- **Behavior**: current state and episodes keep distinct SQLite types/tables; project knowledge is
  versioned under `.void/knowledge/`; skills remain procedural packages; derived route/search
  indexes live only in OS cache and rebuild from authoritative inputs. A model may propose a
  knowledge patch but cannot commit it as learned fact.
- **Verification gate**: deleting every index changes no authoritative digest and a rebuild is
  byte-deterministic; deleting or corrupting an authority is detected; no prompt, secret or raw
  transcript enters any memory category. `memory inspect --json` validates against its schema.
- **Expected commits**:
  - `test(memory): prove derived indexes are disposable and authority stays separated`
  - `feat(memory): expose durable project memory boundaries`
- **Authority after**: native Machine owns native memory; legacy telemetry remains read-only
  history until explicit migration.

### Step VM-09: Apply one Git effect effectively once

- **Goal**: turn an isolated worktree commit into the first authoritative effect governed by the
  outbox contract.
- **Depends on**: VM-04.
- **TDD mode**: strict.
- **Files**: add Git/worktree ports and adapters, effect reconciliation and commit proof, plus
  fixtures under `conformance/machine/effects/git/`.
- **Behavior**: derive a stable effect ID from run, unit, revision, ordinal and canonical payload;
  create and claim the outbox row under a fencing token; observe the exact commit range and file
  set; reconcile before retry; reject shared-repository mutations such as stash, tags, notes,
  remotes and repository config. Worktree bytes are not authoritative until accepted.
- **Verification gate**: crashes before/after outbox claim, Git command and result persistence
  create one accepted commit range at most; stale supervisors cannot finalize; undeclared
  footprint collisions refuse integration; ambiguous observation blocks instead of replaying.
- **Expected commits**:
  - `test(effects): crash every Git effect boundary without duplicate acceptance`
  - `feat(effects): accept isolated commit ranges through the outbox`
- **Authority after**: native Machine owns native Git effects; legacy autopilot remains authoritative
  for legacy runs.

### Step VM-10: Reconcile tracker and CI effects

- **Goal**: apply the same stable effect protocol to Linear progress and GitHub/CI observations.
- **Depends on**: VM-04 and VM-09.
- **TDD mode**: strict for intent/reconciliation policy, souple for provider clients.
- **Files**: add versioned progress and CI port contracts, Linear and GitHub adapters, provider
  simulators, and fixtures under `conformance/machine/effects/remote/`.
- **Behavior**: every write declares whether the provider deduplicates, the Machine reconciles, or
  the effect is non-idempotent. Ambiguous non-reconcilable outcomes become human waits. CI evidence
  is accepted only for required checks on the exact integration SHA. Provider reads and writes are
  bounded, schema-validated, redacted and traced.
- **Verification gate**: simulators inject success, timeout-before-apply, timeout-after-apply,
  duplicate request, stale read, rate limit and permanent refusal. No case produces a duplicate
  authoritative transition or green proof on a different SHA. Live tests use a dedicated fixture
  project and never mutate production tickets.
- **Expected commits**:
  - `test(effects): model ambiguous tracker and CI outcomes`
  - `feat(effects): reconcile Linear and GitHub through stable intents`
- **Authority after**: native adapters own effects created by native runs only.

### Step VM-11: Recover after a bounded unanswered human wait

- **Goal**: let the Machine unblock itself safely after 15 or 20 minutes while keeping irreversible
  decisions human-owned.
- **Depends on**: VM-07, VM-09 and VM-10.
- **TDD mode**: strict.
- **Files**: add decision classification, wait timers, recovery strategy records and rollback
  validation to core/host, with a virtual clock and crash fixtures.
- **Behavior**: persist the deadline before waiting; on expiry allow only a pre-classified
  reversible decision with bounded effects and a proven rollback. Permit at most three strategies
  for one blocker, each with a new hypothesis. Refuse a fourth strategy, secret access, positive API
  spend above policy, production/deploying-branch change, irreversible migration or permission
  widening. Restart observes the durable deadline rather than resetting it.
- **Verification gate**: a virtual-clock matrix covers 15- and 20-minute policies, human reply at
  the boundary, process downtime, clock rollback, three distinct hypotheses, repeated hypothesis,
  failed rollback and every forbidden action. Crash injection proves counters and budgets cannot
  reset.
- **Expected commits**:
  - `test(recovery): refuse every irreversible or fourth autonomous strategy`
  - `feat(recovery): resume reversible work after the durable human timeout`
- **Authority after**: the kernel alone authorizes recovery; the LLM only proposes typed strategies.

### Step VM-12: Cut over one managed implementation ticket

- **Goal**: execute one real `void-implement` ticket from claim to reviewed commit with complete
  proof under either subscription runtime.
- **Depends on**: VM-05, VM-06, VM-07, VM-08, VM-09, VM-10 and VM-11.
- **TDD mode**: strict for orchestration and gates, souple for runtime prompt/materialization glue.
- **Files**: add the managed implement use case, compile the existing
  `packages/core/skills/void-implement/` package, and extend consumer/runtime conformance.
- **Behavior**: claim exactly one provider-native unit; compile project facts, packs, doctrine and
  specialist applicability; run pre-build specialists before writing; supervise one lead writer;
  verify TDD, tests, review and exact commit evidence; update provider lifecycle through effects;
  stop on missing required mechanism. The worker cannot directly mark success or write the tracker.
- **Verification gate**: one seeded consumer ticket completes under Codex and Claude; deliberate
  absent panel, stale review, false worker success, red test, widened permission and provider
  ambiguity each block. The old authoritative single-ticket command is removed or made a pure
  compatibility handoff in the same pull request.
- **Expected commits**:
  - `test(implement): a managed ticket cannot bypass its expert-team proof`
  - `feat(implement): execute one ticket through the native control plane`
  - `refactor(implement): retire the replaced TypeScript authority`
- **Authority after**: native Machine is the only managed single-ticket engine.

### Step VM-13: Integrate a bounded autopilot cluster

- **Goal**: select, isolate and reconcile a bounded cluster while preserving one exact integrated
  tree as the verification subject.
- **Depends on**: VM-12.
- **TDD mode**: strict.
- **Files**: port the proven selection, footprint, lease, worker-result, reconciliation and review
  contracts from `packages/cli/src/lib/autopilot/`; extend cluster fixtures.
- **Behavior**: require explicit programme consent; select only ready independent units with known
  footprints; run disjoint worktrees in parallel and collision zones sequentially; accept commit-only
  results; integrate declared ranges; rerun the complete suite on the union; carry review provenance
  and advisory debt; never shorten the expected ticket set to the workers that returned.
- **Verification gate**: at least four synthetic clusters cover disjoint success, declared
  collision, undeclared widening and partial worker failure. The integrated suite catches a planted
  cross-branch contradiction that every worker suite misses. Killed reconciliation resumes without
  reaccepting a range.
- **Expected commits**:
  - `test(autopilot): make the integrated tree the cluster proof subject`
  - `feat(autopilot): reconcile native worktree workers into one bounded cluster`
  - `refactor(autopilot): quarantine the replaced TypeScript cluster authority`
- **Authority after**: native Machine is the only managed cluster engine.

### Step VM-14: Merge autonomously to develop and nowhere further

- **Goal**: close the approved autonomy loop with an exact-SHA CI proof and a mechanical deploying-
  branch prohibition.
- **Depends on**: VM-13.
- **TDD mode**: strict.
- **Files**: add publication and merge-grant policy to core/host, GitHub branch-protection
  observation to adapters, and end-to-end provider fixtures.
- **Behavior**: publish one non-forced integration branch, open/update one pull request, wait for
  required checks on the exact head SHA, require a fresh adversarial whole-diff review, and merge
  only when programme consent names `develop` and a distinct deploying branch. No command-line flag
  can grant merge authority. `main`, production environments, tags and releases remain impossible
  targets for autonomous effects.
- **Verification gate**: real fixture repository runs cover success, stale CI, changed head,
  inconclusive review, missing branch protection, forced-push attempt, base equal to deploy branch
  and malicious config aliasing `develop` to deployment. Only the valid case merges, exactly once.
- **Expected commits**:
  - `test(autonomy): make the deploying branch unreachable by machine authority`
  - `feat(autonomy): merge an exact-SHA certified cluster into develop`
- **Authority after**: native Machine owns managed autonomy through `develop`; promotion stays HITL.

### Checkpoint B: trust the unattended loop

Folpe launches a real bounded cluster and walks away. From the durable status/proof surface alone,
he must be able to distinguish running, waiting, recovering, blocked, failed and completed; inspect
all three recovery attempts if used; and verify the exact SHA merged into `develop`. No branch that
deploys may have changed.

Stop here. Run `void-verify`, inspect the integrated proof and obtain Folpe's approval before
consumer migration or release activation work begins.

### Step VM-15: Pin and migrate one current consumer

- **Goal**: make consumer install state reproducible and move current projects without losing
  project-owned content.
- **Depends on**: VM-12; Checkpoint B is required before migration becomes a release path.
- **TDD mode**: strict for ownership, compatibility and migration decisions; souple for CLI wiring.
- **Files**: implement `machine.toml`, `machine.lock.json`, OS-native receipt/state paths and
  semantic `init|sync|migrate|paths`; add cross-version consumer fixtures. Extend current
  receipt/manifest migration tests rather than replacing them.
- **Behavior**: pin the exact engine, contracts and content; stage every repository change;
  preserve project-owned conflicts; import legacy authority only through a versioned adapter; and
  emit a reversible migration report before activation. A fresh clone reproduces the same desired
  install from versioned state while machine-local state stays outside the repository.
- **Verification gate**: fresh, current-v3, dirty-owned, linked-worktree, interrupted migration and
  incompatible-contract fixtures all produce the specified result. A project stays on its pin when
  a newer engine is cached. Migration back to the prior released `voidharness` state preserves user
  bytes exactly.
- **Expected commits**:
  - `test(migrate): preserve every user-owned byte across current-consumer cutover`
  - `feat(migrate): pin exact Machine contracts and content per project`
- **Authority after**: the project lock owns desired Machine state; legacy receipts remain migration
  inputs only.

### Step VM-16: Update through a signed rollback transaction

- **Goal**: download, verify and activate a compatible engine without risking the last known-good
  installation.
- **Depends on**: VM-15.
- **TDD mode**: strict for TUF, compatibility and activation decisions; souple for download and
  platform filesystem adapters.
- **Files**: create the isolated updater crate, TUF fixture repository, side-by-side engine store,
  activation journal and updater conformance fixtures.
- **Behavior**: verify root, targets, snapshot and timestamp metadata plus artifact digest and
  provenance; install engines side by side by digest; dry-run config and schema migration; journal
  activation; smoke-test; then atomically activate or return to the prior known-good version. Retain
  two known-good engines. A schema change that breaks rollback requires a human gate and cannot use
  the automatic path.
- **Verification gate**: interrupted download, expired metadata, rollback attack, freeze attack,
  mix-and-match, crash at every activation step and downgrade fixtures all preserve the known-good
  engine and exact project pin. Replaying an activation intent never activates twice.
- **Expected commits**:
  - `test(update): crash every signed activation without losing the known-good engine`
  - `feat(update): activate pinned engines through a TUF-rooted transaction`
- **Authority after**: native updater owns Machine activation; legacy update only detects and hands
  off when a Machine lock exists.

### Step VM-17: Release and certify the native cutover

- **Goal**: publish a supply-chain-verifiable cross-platform release only after the complete product
  path passes from released artifacts.
- **Depends on**: VM-14 and VM-16.
- **TDD mode**: souple for release wiring, strict for artifact selection, trust and compatibility
  rules.
- **Files**: add shell and PowerShell installers, cargo-dist packaging configuration, GitHub release
  attestations and immutable-release checks, npm `void-machine` bridge, release certificate schema,
  and a legacy immutable tag. Update README, architecture, migration and releasing documentation in
  the same cutover commits.
- **Behavior**: installers support pinned version, channel, prefix and dry-run; avoid `sudo` and
  shell-profile edits by default; stage, verify and self-test before activation; offer an explicit
  download-inspect-run path. The npm package only resolves and invokes the same verified artifact.
  The quickstart's second command is explicit and compound:
  `void-machine init --run void-doctor`; it stages initialization and executes the first proof only
  after initialization commits successfully.
  When Node is already available, the npm bridge also supports the explicit one-command trial
  `npx --yes void-machine init --run void-doctor`; the native installer remains the primary path.
  Registry, domain and trademark checks decide the final public label before publication. The
  legacy package receives no new engine behavior and becomes the explicit migration bridge.
- **Verification gate**: independently rebuild and compare each unsigned executable payload digest
  after normalizing archive metadata; verify signatures and attestations on the signed envelopes;
  install, init, route, run, interrupt, recover, implement, cluster, exact-SHA CI, merge to
  `develop`, update and rollback from released artifacts on macOS, Linux and Windows. Real Codex
  and Claude subscription certificates bind the same release SHA. Any missing cell blocks
  publication.
- **Expected commits**:
  - `test(release): certify released artifacts across platforms and subscriptions`
  - `feat(release): publish the verified Void Machine installers and npm bridge`
  - `refactor(release): reduce voidharness to an explicit migration bridge`
  - `docs(machine): cut consumers over without erasing the legacy path`
- **Authority after**: Void Machine is the only managed engine. `voidharness` is a bounded migration
  bridge; remaining legacy source is removed only after the documented support window.

## Review checkpoints

- **Checkpoint A after VM-06**: the same read-only skill runs through real Codex and Claude Code
  subscriptions in at most two commands and five minutes from an authenticated runtime.
- **Checkpoint B after VM-14**: one real unattended cluster merges to `develop`, produces a complete
  exact-SHA proof and cannot reach the deploying branch.
- **Release gate after VM-17**: Folpe explicitly approves publication and later promotion from
  `develop` to `main`. Neither approval can be inferred from programme execution.

## Developer-experience benchmark

The current official Claude Code and Codex quickstarts each present one native install command and
one launch command. OpenCode also presents a one-command installer but then requires provider
configuration. These are interaction-count baselines, not invented elapsed-time claims:

- [Claude Code installation](https://code.claude.com/docs/en/installation)
- [Codex CLI quickstart](https://github.com/openai/codex/blob/main/README.md)
- [OpenCode installation](https://opencode.ai/docs)

Void Machine targets two commands from an already authenticated supported runtime: one install,
then `void-machine init --run void-doctor`. VM-17 measures wall time on all supported
platforms from a clean shell and publishes raw samples. Median time to first verified skill result
must be at most five minutes excluding third-party login; any sample above ten minutes or any
undocumented prerequisite blocks release. `doctor` must diagnose three real first-run failures:
missing runtime, incompatible auth class and unwritable state path, each with problem, cause and an
exact repair command.

## Linear reconciliation rules

Use existing issues when their acceptance criteria match a unit. Comment with the exact new scope
when only part is absorbed. Create a new issue only for a unit with no faithful existing owner.
Never close an issue because its wording appears in this plan.

| Plan unit | Existing issue candidates | Required reconciliation evidence |
|---|---|---|
| VM-01 | DEV-452, DEV-453 | packed legacy and self-host consumer oracle on all platforms |
| VM-02 | DEV-631 | native path/config diagnostics from a packed consumer |
| VM-03 | DEV-458 | portable skill plus executable manifest conformance |
| VM-04 | DEV-798, DEV-803 | one state owner, crash resume and proof refusal |
| VM-05, VM-06 | DEV-450 | real Codex and Claude subscription certificates |
| VM-07 | DEV-735 | eligibility, semantic ranking and fallback conformance |
| VM-08 | DEV-609, DEV-611 | versioned knowledge and deterministic index rebuild |
| VM-09 | DEV-621 | Git-effect resume from every injected crash point |
| VM-10 | DEV-706 | exact-SHA CI and reconciled remote-effect evidence |
| VM-11 | new unless a faithful issue exists | durable 15/20-minute, three-strategy recovery matrix |
| VM-12 | DEV-733, DEV-734, DEV-803 | managed panel and single-ticket end-to-end proof |
| VM-13, VM-14 | DEV-706 and autopilot descendants | integrated tree proof and develop-only merge |
| VM-15 | DEV-452, DEV-631, DEV-645 | current-consumer migration and exact pin |
| VM-16 | DEV-630 | signed update activation and rollback |
| VM-17 | DEV-453, DEV-659 | released artifact, real-runtime and naming certificate |
| deferred Workbench | DEV-623 | remains open and explicitly outside this programme |
| audit after every cutover | DEV-666 | absorbed/superseded issue report with evidence |

DEV-591 and DEV-791 stay independent unless a specific regression test proves that a unit removed
their root cause.

## Execution handoff

The table is the stable programme order. Linear owns live status, assignees, blocker relations,
comments and review evidence after `void-ticket` materializes the approved pool.

| Key | Title | Depends on | Estimate | Human gate |
|---|---|---|---:|---|
| VM-01 | Freeze current consumer contract | none | 5 | no |
| VM-02 | Native doctor through compatibility package | VM-01 | 5 | no |
| VM-03 | Portable executable skill package | VM-02 | 5 | no |
| VM-04 | Durable no-effect run and proof | VM-03 | 8 | no |
| VM-05 | Codex subscription adapter | VM-04 | 5 | no |
| VM-06 | Claude subscription adapter | VM-04 | 5 | no |
| CP-A | Subscription-first product review | VM-05, VM-06 | 0 | yes |
| VM-07 | Deterministic and semantic router | VM-04, CP-A | 5 | no |
| VM-08 | Separated memory and rebuildable indexes | VM-07 | 5 | no |
| VM-09 | Effectively-once Git effect | VM-04 | 8 | no |
| VM-10 | Tracker and CI effects | VM-09 | 8 | no |
| VM-11 | Bounded reversible recovery | VM-07, VM-09, VM-10 | 8 | no |
| VM-12 | Managed single-ticket implementation | VM-05, VM-06, VM-08, VM-11 | 8 | no |
| VM-13 | Bounded autopilot cluster | VM-12 | 8 | no |
| VM-14 | Autonomous develop merge | VM-13 | 5 | no |
| CP-B | Unattended loop review | VM-14 | 0 | yes |
| VM-15 | Exact project lock and consumer migration | VM-12, CP-B | 5 | no |
| VM-16 | TUF-rooted update and rollback | VM-15 | 8 | no |
| VM-17 | Native release and cutover certificate | VM-14, VM-16 | 8 | yes |

Estimates use tracker points, not elapsed hours. Any 8-point unit that cannot credibly finish within
two focused implementation days must be split along a demonstrable vertical boundary before it is
claimed.

## Completion criteria

The programme is complete only when VM-17 passes from released artifacts, every absorbed Linear
issue is reconciled against evidence on `develop`, the legacy tag exists, the migration bridge has a
documented removal window, and Folpe has explicitly approved release. The later `develop -> main`
promotion remains outside programme authority.

## High-risk plan review: 2026-09-04

### Scope gate

The plan touches more than eight files and introduces five crates, so it has the default shape of a
size smell. It is acceptable only as a provider-backed programme of independent vertical cutovers.
Treating this document as one ticket, branch or pull request is a P1 violation of the plan.

### CEO lens: REDUCTION

- **P1, mechanical, resolved** -
  `docs/plans/2026-09-04-void-machine-foundation-plan.md:30` says, "a unit is limited to two
  focused implementation days." The original migration/update/release tail violated that bound.
  The author split project migration, TUF activation and public distribution into VM-15, VM-16 and
  VM-17. This changes sequencing, not product scope.
- The approved alternatives are explicit, every cutover has a reversal point, and the first value
  is dual-subscription read-only execution rather than a horizontal kernel build.
- **Verdict**: CLEARED. No unresolved premise or scope decision remains.

### Design lens

Skipped. The Workbench UI is explicitly outside this programme. Terminal copy and diagnostics are
developer-experience contracts, not a visual product surface.

### Engineering lens

- **P1, confidence 10/10, mechanical, resolved** -
  `docs/plans/2026-09-04-void-machine-foundation-plan.md:289` originally relied on a "minimal
  allowlisted environment" without proving filesystem, network or process-tree containment. The
  author added one adversarial escape probe for both runtime adapters and made failed containment
  assisted-only instead of managed.
- **P1, confidence 9/10, mechanical, resolved** - real subscription evidence outside public CI
  could become stale or forgeable. Certificates are now signed and invalidated by adapter, runtime
  compatibility, content or source changes.
- **Architecture**: core owns state and authority; host owns use cases; adapters own I/O; CLI is the
  composition root. Each migrated behavior names its one authoritative engine.
- **Failure-path coverage**:

  | Code path | Happy | Nil/empty | Upstream/error | Concurrency/crash |
  |---|---|---|---|---|
  | Skill package and router | eligible route | empty/ambiguous set | invalid ranker/schema | deterministic replay |
  | State, proof and SQLite | completed no-effect run | absent proof | corrupt store/busy policy | model plus crash matrix |
  | Runtime processes | valid subscription result | logged-out/missing binary | malformed/oversized/timeout | cancellation and escape probe |
  | Git, tracker and CI | reconciled effect | not seen | ambiguous/permanent failure | fencing and every effect boundary |
  | Human recovery | reversible strategy | no reply | forbidden/fourth/failed rollback | durable deadline and counter |
  | Migration and update | compatible activation | no prior install | stale/TUF/corrupt/incompatible | every journal and swap point |

- Postgres/Neon and Workbench coverage is intentionally absent because neither ships in this
  programme.
- **Performance**: every queue, timeout, output and randomized test count is bounded. Derived indexes
  are disposable; no network service or N+1-shaped remote loop is introduced.
- **Verdict**: CLEARED. The two P1 findings are folded into executable gates.

### Developer-experience lens

- **P1, mechanical, resolved** -
  `docs/plans/2026-09-04-void-machine-foundation-plan.md:627` promises two commands. The original
  wording counted installation and run but omitted initialization. The author made the second
  command `void-machine init --run void-doctor` and added a one-command npm trial for machines that
  already have Node.
- The competitive baseline uses current official quickstarts and compares interaction count only;
  elapsed times remain unclaimed until VM-17 measures them.

  | Dimension | Plan score | Prior harness | Trend |
  |---|---:|---:|---|
  | Getting started | 8/10 | 6/10 | improving |
  | Interface naming/defaults | 8/10 | 6/10 | improving |
  | Actionable errors | 9/10 | 7/10 | improving |
  | Version-matched docs | 8/10 | 7/10 | improving |
  | Upgrade and rollback | 9/10 | 5/10 | improving |
  | Cross-platform development | 8/10 | 7/10 | improving |

- **TTHW target**: Tier A, at most five minutes median after third-party authentication and never
  above ten minutes. **Competitive rank**: interaction-count parity with the official Claude Code,
  Codex and OpenCode install/launch journeys, with stronger proof and rollback requirements. The
  elapsed-time rank remains unknown until VM-17 publishes raw samples.
- **Verdict**: CLEARED for ticketing; shipped-surface claims remain gated by measured VM-17 data.

### Cross-lens synthesis and auto-decision audit

Two lenses found the same theme: the programme may be broad, but no individual authority change may
be broad or implicit. The mechanical decisions were to split the release tail, certify real
containment, sign and invalidate runtime certificates, and make the two-command onboarding path
literal. No taste or user-challenge decision was auto-decided.

### Implementation Tasks

- **P1, folded**: keep VM-15, VM-16 and VM-17 separate; split any other 8-point unit before claim if
  it exceeds two focused implementation days.
- **P1, folded**: require the real adversarial containment probe before either runtime can claim
  managed execution on a platform.
- **P1, folded**: sign real-runtime certificates and invalidate them on every relevant identity
  change.
- **P1, folded**: certify the literal two-command quickstart and one-command npm trial.
- **P2, scheduled in VM-17**: publish raw time-to-first-value samples and the three first-run error
  traces before release.

**Aggregated verdict: CLEARED for human plan review and ticket materialization.** Implementation
remains forbidden until Folpe approves this plan and the existing programme collision is reconciled.
