---
title: Void Machine foundation
date: 2026-09-04
status: approved
author: Folpe + Codex
ticket:
related:
  - docs/specs/2026-08-31-autonomous-until-develop.md
  - docs/specs/2026-07-25-autopilot.md
  - docs/ARCHITECTURE.md
  - docs/PHILOSOPHY.md
---

# Void Machine foundation

## Decision summary

The product becomes **Void Machine**, a local-first AI engineering harness. Its future visual
control surface is **Void Workbench**. The existing repository and Git history remain the migration
workspace, but a new native kernel is built behind a hard boundary and replaces the current
TypeScript execution paths one vertical slice at a time.

The product, command and package names remain working names until registry, domain and trademark
checks complete before public cutover. That clearance may change the label, not the architecture.

Void Machine is:

- runtime-agnostic at its control boundary;
- subscription-first for local Claude Code and Codex usage;
- API-capable only when an explicit policy and non-zero budget permit it;
- proof-carrying for every execution it supervises;
- local-first, with a storage port that can later target Postgres and Neon;
- deterministic for state, permissions, routing eligibility, effects and recovery limits;
- model-driven only where judgment is required;
- installable without Node.js in the consumer project.

The native kernel is implemented in stable Rust. This choice is accepted only under a readability
contract: no authored `unsafe`, no panic-driven production control flow, few crates, explicit state
types, small modules, complete contract tests and architecture documentation understandable by a
TypeScript developer.

This specification does not authorize implementation. It must be reviewed and explicitly approved
first. Approval will supersede the current assumption that the harness core is TypeScript and web
specific. That supersession must be recorded in dedicated ADRs before code crosses the new boundary.

## Product promise

> Install one machine into a project. It discovers and runs skills through the user's existing AI
> subscriptions, remembers what matters, advances work autonomously until the declared human gate,
> and can prove exactly what happened.

The word *machine* carries the missing product dimension: this is neither a prompt library nor an
agent persona. It is the executable system that coordinates runtimes, skills, tools, memory,
policies and proofs. The word *workbench* is kept for the interface where a craftsperson inspects
and steers that machine.

The product category is **local-first AI engineering harness**. Marketing may shorten this to
**the reliable machine for autonomous software work**, but documentation must preserve the precise
category.

## Why the current architecture must change

The existing harness contains valuable doctrine, skills, hooks, packs, tests, install receipts,
managed-block handling and an increasingly capable autopilot. It also carries structural limits
that repeated iterations have exposed:

1. unattended orchestration is split between prose, runtime-specific behavior and CLI helpers;
2. the current run cursor can be created without one clear authority advancing it;
3. some proof records state what a worker claims instead of what the executor observed;
4. update routing depends on historical install shape and can confuse desired state with observed
   state;
5. a runtime can silently lack a skill, hook, panel or connector while the surrounding workflow
   continues;
6. filesystem effects and remote effects do not yet share one idempotent execution contract;
7. project knowledge, episodic history, durable state and derived indexes do not have hard type and
   ownership boundaries;
8. the current universal core assumes TypeScript and web work where the future product must be
   language- and stack-agnostic.

The migration keeps the proven assets and rejects the accidental architecture. The existing test
corpus becomes a behavioral oracle, not a reason to keep two production engines.

## Reliability invariants

These invariants are non-negotiable. A migration, performance optimization or new adapter may not
weaken them.

1. **Executable skill manifest.** Every skill declares capabilities, typed inputs and outputs,
   permissions, effects, runtime requirements and success evidence in a machine-validated manifest.
2. **Deterministic eligibility before semantic ranking.** The router first computes the eligible
   set from manifests and policy. Semantic ranking may order only that set and cannot add a route.
3. **No LLM authority over state or permissions.** A model may propose a typed command. The kernel
   alone validates and applies transitions, permissions, budgets and effects.
4. **Stable effects.** Every effect has a stable identifier, an outbox record and an idempotency
   key. Retries assume at-least-once delivery and adapters must deduplicate or reconcile.
5. **Proof-carrying runs.** Every supervised run records sources, skill, route, runtime, billing
   mode, budget, effects, commits, tests, CI and exact SHA where applicable.
6. **Separated memory.** Durable current state, append-only episodic history, versioned project
   knowledge, procedural skills and derived indexes have separate contracts and owners.
7. **Bounded reversible recovery.** After the declared 15 or 20 minute timeout without a human
   answer, automatic recovery is allowed only for a reversible decision. A blocker receives at
   most three strategies, each based on a new hypothesis and carrying an exact rollback.
8. **Crash certification.** Certification injects a crash around every durable transition and
   effect boundary. It proves no duplicated authoritative effect, no false success, exact resume
   and budget compliance.

In addition:

- a missing capability is a typed refusal, never a silent downgrade;
- an ambiguous effect result is not equivalent to failure and is never blindly retried;
- `unknown` is a valid proof value; fabricated precision is not;
- promotion to the deploying branch remains human-controlled and cannot be enabled by a run flag.

## Scope of the first native release

The first native release must demonstrate one complete path rather than expose every planned
extension:

1. install and update Void Machine on macOS, Linux and Windows;
2. initialize or migrate a consumer repository without losing user-owned content;
3. discover, validate, route and execute a skill;
4. run through authenticated Claude Code or Codex CLI subscription mode;
5. support explicit API fallback, disabled when its budget is `0`;
6. persist state, events, outbox, leases, proofs and local memory in SQLite;
7. recover safely after interruption and after a bounded human timeout;
8. execute one ticket and one bounded autopilot cluster through tests, CI and merge to `develop`;
9. make promotion from `develop` to the deploying branch impossible through autonomous commands;
10. update from the current `voidharness` install and roll back to the last known-good version;
11. certify the above in real consumer fixtures and, where credentials are supplied, against the
    real Claude and Codex runtimes.

The first native release does not include:

- the graphical Workbench implementation;
- multi-host orchestration or a hosted control plane;
- a third AI runtime;
- a general-purpose LLM proxy;
- a required cloud database;
- automatic installation of untrusted third-party packs;
- autonomous production deployment or merge to the deploying branch.

## Assurance levels

Void Machine must not overstate what it controls.

### Managed execution

The Machine launches the runtime process, prepares its isolated workspace, resolves its explicit
configuration, mediates authoritative external effects, observes its result and seals the proof.
Only this mode is called **managed**, **autonomous** or **proof-carrying**.

### Assisted execution

A user may still open Claude Code or Codex directly and invoke installed skills exactly as today.
The Machine can install doctrine, inspect resulting Git state and import declared artifacts, but it
did not supervise every transition or effect. This mode is called **assisted** and its proof lists
the missing observations.

The same skill content may support both modes. The guarantee differs because the execution
boundary differs.

## Kernel authority and execution model

The kernel is a functional core with an imperative shell.

The pure core owns:

- identifiers and boundary value objects;
- state-machine transitions;
- eligibility and deterministic route ordering;
- permission and budget decisions;
- recovery eligibility and strategy count;
- effect intents and idempotency keys;
- proof requirements and terminal outcome rules.

Adapters own:

- Claude Code and Codex processes;
- Git and worktrees;
- filesystem materialization;
- GitHub, Linear and other progress providers;
- SQLite and later Postgres/Neon persistence;
- clocks, process signals and operating-system paths;
- semantic ranking and embedding providers;
- release download, verification and atomic activation.

The composition root wires plain ports into use cases. Domain code imports no adapter, SDK, CLI
framework or environment reader. There is no dependency injection container, mediator framework,
generic repository abstraction or event-sourcing framework.

### Typed proposal boundary

The LLM produces a versioned command envelope such as:

```json
{
  "schemaVersion": 1,
  "runId": "run_...",
  "expectedRevision": 17,
  "command": {
    "type": "request_effect",
    "capability": "tracker.issue.comment",
    "inputRef": "artifact_..."
  }
}
```

The kernel may accept, reject or convert the proposal into a human wait. The model cannot write a
state row, event, permission grant, lease, outbox entry, proof or budget counter directly.

### State machine

The initial run states are a closed discriminated union. The allowed transition map is explicit:

```text
planned        -> ready | cancelled
ready          -> running | failed | cancelled
running        -> awaiting_human | recovering | verifying | failed | cancelled
awaiting_human -> running | recovering | failed | cancelled
recovering     -> running | awaiting_human | failed | cancelled
verifying      -> running | completed | failed | cancelled
completed      -> <terminal>
failed         -> <terminal>
cancelled      -> <terminal>
```

Transitions carry a monotonic revision and require the caller's expected revision. Current state,
the append-only event and any outbox intents created by the transition commit in one database
transaction. A terminal state is immutable.

The initial unit states are separate from run states. A run may be `running` while one unit waits
and another verifies. There is one state owner: the kernel use case handling the command. No CLI
command, skill or adapter manually advances a cursor.

### Lease and process ownership

One active supervisor owns a run lease. Leases use a monotonically increasing fencing token, not
only a wall-clock expiry. Any write from a stale supervisor is rejected. Process identity and
heartbeat are observations; the fencing token is authority.

Cancellation is a persisted command before it becomes an operating-system signal. On restart, the
supervisor reconciles the durable intent with the observed child process and worktree.

## Skill contract

`SKILL.md` remains portable and valid against the Agent Skills specification. Its frontmatter uses
only standard fields. Each Machine-capable skill is paired with a co-located `harness.yaml`, which
holds the structured executable manifest that the portable standard cannot represent.

The source directory and signed content package treat both files as one unit. A release index binds
the digest of the portable skill directory and the digest of `harness.yaml` into one package
identity. Void Machine reads the manifest from the exact pinned content package; Claude Code, Codex
and other runtime materializers receive portable skill files without proprietary frontmatter.
Installation and certification refuse a missing, stale or incompatible half of the pair.

The minimum `harness.yaml` manifest is:

```yaml
schemaVersion: 1
id: void-implement
kind: action
version: 1
capabilities:
  provides: [code.unit.ship]
  requires: [vcs.git, tests.command]
inputs:
  schema: schemas/implement-input.schema.json
outputs:
  schema: schemas/worker-result.schema.json
permissions:
  workspace: worktree-write
  network: declared-only
effects:
  - vcs.commit
success:
  proofs: [tests.green, review.completed, commit.observed]
runtime:
  features: [structured-output]
limits:
  timeoutSeconds: 7200
```

Rules:

- every boundary payload validates against a versioned JSON Schema;
- capabilities and permissions use a closed registry for each schema version;
- unknown manifest fields are refused in v1 to catch misspellings;
- a skill cannot grant itself a capability or permission;
- instructions may explain a rule but cannot replace a required manifest field;
- manifest compatibility is checked before a run starts, never halfway through it;
- the proof binds the exact portable skill digest, manifest digest and package identity used.

## Router

Routing has two stages and one stable fallback.

### Stage 1: deterministic eligibility

The kernel filters by:

- requested capability and input schema;
- project facts and active packs;
- installed runtime features;
- permissions and network policy;
- billing policy and remaining budget;
- platform and tool availability;
- skill and contract compatibility;
- explicit allow/deny rules;
- declared conflicts and prerequisites.

The result is explainable: every rejected route records one or more typed reasons.

### Stage 2: semantic ranking

A semantic adapter ranks only eligible routes using the user intent, skill descriptions, recent
route outcomes and project context explicitly allowed for routing. Its output is advisory. The
kernel validates that every returned skill was eligible, applies deterministic tie-breakers and
records the candidate scores.

If semantic ranking is missing, times out or returns invalid data, routing falls back to a stable
deterministic order. It does not widen permissions and it does not make the whole Machine unusable.

The first implementation may use the selected subscription runtime for ranking. An embeddings
index is a derived optimization, not a source of truth and not a v1 requirement.

## Effects, outbox and idempotency

Every authoritative side effect follows the same protocol:

1. the core creates an `EffectIntent` while applying a valid transition;
2. the state, event and outbox row commit atomically;
3. a dispatcher claims the row under a fencing token;
4. the adapter sends the stable idempotency key where the provider supports it;
5. the adapter observes or reconciles the provider result;
6. the kernel records `applied`, `not_seen`, `ambiguous` or `permanent_failure`;
7. only a recorded acceptable outcome can satisfy the related proof.

`EffectId` is derived from stable inputs: run, unit, transition revision, effect ordinal and a
canonical payload digest. A retry never invents a new identifier.

An adapter contract declares its guarantees:

- `provider_deduplicates`: the remote provider honors the supplied key;
- `machine_reconciles`: the Machine can query a stable remote identity before retry;
- `non_idempotent`: neither is true, so an ambiguous result becomes a human block.

The product promises effectively-once authoritative outcomes where an adapter can prove them. It
does not claim distributed exactly-once execution.

Runtime processes are attempt-scoped effect containers. Writes inside an isolated worktree are not
authoritative project outcomes until the Machine observes and accepts an exact commit range. A
runtime may not call a remote write connector directly in managed mode unless that connector is
explicitly modeled as a Machine effect.

## Memory model

Memory is separated by purpose even when two categories share the same transactional database.

| category | authority | storage | mutation model |
|---|---|---|---|
| current durable state | kernel | local store | validated transition |
| episodic history | kernel observation | append-only event log | append only |
| project knowledge | repository | `.void/knowledge/` | reviewed, versioned files |
| procedural memory | skill packages | `SKILL.md` plus manifest | signed/versioned install |
| derived indexes | none | cache | disposable and rebuildable |

Current state and episodic events may share SQLite so a transition is atomic. They remain separate
types, tables and ports. Project knowledge is never silently learned from transcripts. A model may
propose a knowledge change; repository policy decides whether it needs review. Derived indexes can
always be deleted without losing information.

Secrets are not memory. The Machine references the runtime's approved credential store or an
ephemeral environment binding and never copies credentials into project files, proofs or logs.

## Recovery after an unanswered human gate

The program declares either 15 or 20 minutes; the default is 20. The timer starts from the durable
`awaiting_human` event, not process memory.

After expiry, the Machine may recover only when all conditions hold:

- the program explicitly opted into autonomous recovery;
- the decision is classified as reversible by deterministic policy;
- the change remains isolated to a worktree or reversible local Machine state;
- the rollback target and command are known before execution;
- no secret, permission escalation, production branch, deployed schema, public irreversible
  contract or spend beyond policy is involved;
- the next strategy is based on a hypothesis not already tried for this blocker.

Architecture choices are reversible when they are provisional and branch-confined. For example,
choosing between two internal module boundaries is recoverable; publishing a public contract,
dropping a database column or promoting to `main` is not.

A blocker has at most three recovery strategies. Each record contains:

- the new hypothesis and evidence that distinguishes it;
- the intended change and bounded blast radius;
- the rollback procedure and verification;
- the budget consumed;
- the outcome.

After three unsuccessful strategies, the run stops with a truthful blocked outcome. Rephrasing the
same attempt does not reset the count.

The secret restriction forbids creating, retrieving, rotating, transmitting or widening access to
a credential. It does not prevent an already authenticated runtime from using its existing approved
credential store inside the original permission envelope.

## Runtime adapters and subscription mode

### Codex

The managed adapter invokes `codex exec` with explicit working directory, sandbox, approvals,
structured output and required MCP configuration. Codex officially reuses saved CLI
authentication, including ChatGPT subscription authentication. API-key mode remains available but
is selected only by Machine policy.

The child process receives an allowlisted environment. When subscription mode is selected, API-key
variables are removed and the adapter verifies the active authentication mode before work starts.
The variable names may enter diagnostics; their values never do.

For local managed runs, the recommended path is the user's existing `codex login` session. For
enterprise headless automation, access tokens or workload identity may be supported by a later
credential adapter. Copying user credential files is never an install step.

### Claude Code

The managed adapter invokes `claude -p` with structured streaming output, explicit tools,
permission mode, limits and settings. Claude Code officially supports subscription authentication
for normal `-p` execution. If `ANTHROPIC_API_KEY` is present, it overrides the subscription in
non-interactive mode, so the adapter must detect and report that fact before a spend-capable run.

The subscription path is a release-blocking product capability, not a best-effort optimization.
Void Machine invokes the official Claude Code executable and lets that executable own login,
credential refresh and provider communication. The Machine does not embed the Agent SDK for this
path, extract or copy OAuth credentials, offer a third-party Claude.ai login, or proxy Anthropic
requests. If the installed official CLI cannot prove a supported subscription execution path, the
Claude adapter is incompatible and the run refuses. It never converts that incompatibility into an
API call.

When subscription mode is selected, the Machine removes API-key variables from the child
environment and verifies the resulting authentication mode. If it cannot distinguish subscription
from API billing, it refuses the run instead of consuming an unapproved fallback.

As of this specification, Anthropic accounts subscription-based `claude -p` and Agent SDK use
against a separate monthly Agent SDK credit. The adapter therefore records subscription quota as
quota, not as zero-dollar API cost.

Claude's recommended `--bare` mode does not read OAuth or the keychain. Void Machine cannot use
`--bare` for subscription-first local execution unless Anthropic provides an explicit compatible
credential path. Instead it supplies a minimal generated settings surface and records every
ambient source that could not be disabled. Runtime certification must catch any future change in
this behavior. An outer Machine sandbox remains the permission authority even when Claude's prompt
and hook discovery cannot be made hermetic; the proof marks prompt/config hermeticity separately
from effect containment.

### Billing policy

The policy distinguishes:

```text
subscription | api | local | unknown
```

An API fallback requires both `allowApiFallback = true` and a positive explicit ceiling. The
default Claude API ceiling is `0`, which disables fallback completely. Unknown billing mode cannot
perform a spend-capable fallback.
Subscription usage records quota metadata when observable and `unknown` otherwise; it is never
reported as an exact API cost of zero.

### Adapter conformance

Both runtime adapters must pass the same suite for:

- authentication and billing-mode observation;
- structured output parsing and unknown-event tolerance;
- cancellation and process-tree cleanup;
- timeout and bounded retry behavior;
- workspace and network isolation;
- missing skill, hook, MCP server and permission failures;
- exact commit and test observation;
- version and feature negotiation;
- crash and resume behavior.

A real-runtime certificate binds the adapter, runtime version, operating system and exact Void
Machine SHA. A mocked process test cannot replace it.

## Storage and Neon

The first authoritative store is bundled SQLite because the primary product is local-first and must
start with no account, daemon or network. The adapter uses WAL, strong synchronization, foreign
keys and explicit transactions. A dedicated blocking thread owns writes so SQLite never blocks the
asynchronous executor; readers never construct domain state outside kernel queries.

Postgres is the first remote storage adapter and Neon is a supported deployment of that adapter.
It is not a separate domain model. SQLite and Postgres must pass the same storage conformance suite.
One run has exactly one authoritative store; there is no optimistic dual-write between local and
remote databases.

The Postgres adapter uses row leases with fencing tokens and transactional outbox semantics. It
does not rely on session-level advisory locks because transaction poolers may change the physical
connection. Network partitions surface as unavailable or ambiguous state, never as inferred
success.

Remote storage is an extension after the first native release unless a real multi-host use case
proves it necessary earlier. The port and conformance contract ship first so adding Neon does not
change the core.

## Repository and package architecture

The existing repository is retained to preserve history, releases, consumer fixtures, regression
tests and issue traceability. The new implementation is physically isolated:

```text
crates/
  void-machine-core/       # pure domain, state machine, policy, routing, proofs
  void-machine-host/       # use cases, supervisor, process lifecycle
  void-machine-adapters/   # runtime, Git, tracker, storage and CI adapter modules
  void-machine-updater/    # isolated release trust boundary
  void-machine-cli/        # composition root and public CLI

content/
  core/                    # portable skills, agents, hooks and doctrine sources
  packs/
    code/
    nextjs/
    neon/

packages/
  content-compiler/        # transitional build-time TypeScript only
  legacy-bridge/           # bounded migration adapter, deleted at cutover

apps/
  workbench/               # reserved future UI, not a v1 deliverable

conformance/
  consumers/
  runtimes/
  storage/
  updates/
```

The number of Rust crates is deliberately small. New crates require an ADR-level reason such as a
separate security boundary or independently releasable artifact. Module boundaries are preferred
over microcrates.

### Migration rule

- new Rust code may not import or shell into the old TypeScript mission engine;
- both implementations consume versioned JSON contracts and the same fixtures;
- the old path may run in read-only shadow mode to compare decisions;
- only one implementation is authoritative for a given command in a release;
- each vertical cutover deletes or quarantines the replaced production path;
- no native release is declared compatible until install, update, runtime and fault certificates
  pass on real consumer fixtures.

This is a strangler migration inside one history, not a rewrite-in-place and not two products. The
GitHub repository may be renamed to `void-machine` at public cutover; Git history and redirects are
preserved. A separate repository is considered only if team ownership, release cadence or security
governance later diverges.

## Consumer filesystem layout

The repository contains only portable desired state and versioned knowledge:

```text
.void/
  machine.toml             # human-owned policy and selected packs
  machine.lock.json        # exact engine, content and contract digests
  PROJECT-DOCTRINE.md      # project-specific durable rules
  knowledge/               # versioned project knowledge
  routes/                  # optional project route policies
```

Machine-local state does not live in `.void/local`, because Git worktrees would create competing
copies and a normal run would dirty the project. It lives in the operating system's native state
directory, keyed by the canonical Git common-directory identity:

```text
<state>/void-machine/repos/<repo-id>/control.sqlite
<state>/void-machine/repos/<repo-id>/proofs/
<state>/void-machine/repos/<repo-id>/receipts/
<cache>/void-machine/engines/<content-digest>/
```

`void-machine paths` prints every resolved location. If the repository moves, an explicit recovery
command rebinds the identity after proving the Git history relationship. Paths and repo identifiers
contain no secret.

### Desired state, observed state and ownership

- `machine.toml` is the human-readable desired policy;
- `machine.lock.json` is the committed exact desired installation;
- the local receipt records observed bytes, migrations and activation state;
- update and sync route from desired state, never from historical receipt shape;
- the receipt may prove drift but cannot silently choose a new desired version.

Ownership is semantic:

- fully managed files use a whole-file digest;
- managed sections use block identity and block digest;
- merged JSON/TOML uses declared path projections and expected values;
- presence-only ownership is allowed only when no safer semantic merge exists.

User-owned content outside the declared projection is never overwritten to repair managed drift.

## Packs

The kernel knows capabilities and contracts, not software stacks.

The base `code` pack supplies enduring engineering behavior: repository discovery, TDD, debugging,
review, security, accessibility where relevant, Git discipline, CI evidence and tracker flow.
Stack packs such as `nextjs` or `neon` depend on `code` and add only stable constraints, detection,
commands and specialist knowledge that genuinely differ.

The pack treats engineering principles as decision rules, not an acronym checklist: KISS before a
new abstraction, DRY only after repeated knowledge is proven, SOLID and hexagonal boundaries where
change or trust boundaries justify them, and TDD strictness selected by risk. The proof records the
applicable gates; an LLM cannot claim quality by naming a pattern.

Fast-changing configuration and API details are resolved from official documentation for the
installed version at execution time. A pack must not copy a technology's complete documentation
into skills. This keeps specificity current without polluting the agnostic kernel.

Future non-code packs use the same manifest and capability model. No code concept is placed in the
core merely because the first product pack is code.

## Autonomous product flow

With explicit program consent, the code pack supports this path:

```text
idea
  -> grounded research
  -> brainstorm and approved specification
  -> reviewed implementation plan
  -> tracker-native tickets and dependencies
  -> deterministic ticket selection
  -> isolated implementation and specialist review
  -> integration, full-suite seal and exact-SHA CI
  -> merge to develop
  -> human promotion to the deploying branch
```

The Machine owns the procedure and calls LLM runtimes only for judgment. Skills define procedural
knowledge and proof obligations; they do not become an alternative state machine.

An `autopilot` block in the committed program is explicit consent to autonomous ticket selection.
A progress-provider declaration is not consent. Missing or unreadable consent refuses selection.
The provider owns mutable ticket state; the program owns policy and ordering.

The router may propose a "x10" exploration when evidence shows a material opportunity, but it must
preserve the original user outcome, declare the additional hypothesis and budget, and return to an
approval boundary before expanding an irreversible public scope.

## Proof model

Every managed run emits a canonical `RunProof` containing at least:

- run, unit, program and policy identities;
- source artifacts and their digests;
- skill manifest, content digest and route decision;
- eligible candidates, rejection reasons and semantic ranking observations;
- runtime binary version, adapter version, model when observable and billing mode;
- budget ceilings, observed quota/cost and `exact`, `estimated` or `unknown` precision;
- state transitions and append-only event hashes;
- effect intents, idempotency keys and reconciled outcomes;
- human waits and every recovery hypothesis, rollback and result;
- Git base, observed commit ranges, diff digest and final exact SHA;
- test commands, exit status, tree digest and captured output digest;
- CI provider, run URL, check identities and exact checked SHA;
- final outcome and any absent or degraded evidence.

Proofs contain references and digests rather than secrets or full prompts. Sensitive provider output
is redacted before persistence under a typed policy. The canonical proof is content-hashed and may
later be signed; its usefulness does not depend on a hosted Void service.

`completed` means all absolute proof requirements are present and valid. A worker message claiming
success is never a proof source.

## Installer, release and update architecture

### Distribution

The primary install experience is:

```sh
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/voidcorp-core/void-harness/releases/latest/download/void-machine-installer.sh \
  | sh
```

A PowerShell installer provides the equivalent Windows path. An npm package exposes
`npx void-machine` as a thin compatibility launcher that downloads and executes the same verified
native artifact. Consumer execution does not require Node.js.

The shell installer:

- accepts pinned version, channel, prefix and dry-run options;
- detects operating system and architecture;
- never requires `sudo` by default;
- stages into a temporary directory;
- verifies release metadata, digest and provenance before execution;
- runs a native self-test before atomic activation;
- does not modify shell startup files without explicit consent;
- leaves a recovery instruction on failure.

The first download still trusts the HTTPS-delivered bootstrap script. Documentation must offer a
download-inspect-run path and pinned versions rather than claim impossible bootstrap perfection.
After installation, a pinned TUF root becomes the update trust anchor.

`cargo-dist` may generate release archives and platform installers. Its experimental self-updater
is not the production update mechanism.

### Supply-chain trust

- GitHub releases are immutable after publication;
- artifacts are built in CI from a tagged commit;
- release attestations bind source SHA and artifact digest;
- npm publication uses trusted publishing with provenance;
- TUF root, targets, snapshot and timestamp metadata protect target selection, rollback, freeze and
  mix-and-match attacks;
- signing authority and release approval are separate roles;
- the updater refuses expired or inconsistent metadata unless an explicit offline policy applies.

The updater is an isolated trust boundary with no skill execution or LLM dependency.

### Two version layers

The global launcher and the project-pinned engine are distinct:

- the launcher knows how to verify, install, select and roll back engines;
- `machine.lock.json` pins the exact compatible engine, contracts and content for a project;
- engines install side by side under their content digest;
- a project run never silently switches to the newest cached engine.

Commands:

```text
void-machine init
void-machine sync
void-machine doctor
void-machine status
void-machine run <intent-or-skill>
void-machine autopilot
void-machine proof verify <run>
void-machine update check
void-machine update [--to <version>]
void-machine rollback
void-machine migrate
void-machine paths
```

`status` and `doctor` may check signed update metadata with a bounded timeout and cached fallback.
Normal work does not auto-update. Optional background pre-download may be added later, but activation
always follows project compatibility checks.

### Update transaction

1. resolve signed metadata and the project compatibility range;
2. download the new engine beside the active one;
3. verify TUF metadata, artifact digest and provenance;
4. dry-run config, lock and database migrations;
5. stage consumer-owned file changes with a semantic conflict report;
6. run self-test and consumer conformance against the staged version;
7. journal the activation intent;
8. atomically switch the project receipt to the new engine;
9. run `doctor` and a smoke execution;
10. commit completion or automatically return to the prior known-good engine.

The two most recent known-good engines are retained. Database schemas follow expand-contract rules
and remain readable by the rollback version across the supported window. An update that cannot
guarantee rollback requires an explicit human migration gate.

The existing `voidharness` package remains a bounded migration bridge. It detects the new lock,
hands off to Void Machine and explains the rename. It is not a second execution engine and receives
no new features after cutover.

## Rust readability and safety contract

Rust is an implementation choice, not a complexity license.

- every authored crate declares `#![forbid(unsafe_code)]`;
- production code does not use `unwrap`, `expect`, `panic!`, unchecked indexing or process abort as
  normal control flow;
- errors are closed, typed values with actionable context and stable machine codes;
- state is represented by enums and validated value objects, not strings and booleans;
- modules target one responsibility and expose the smallest usable API;
- macros are limited to standard derivations and reviewed repetitive declarations;
- mutable global state and hidden service locators are forbidden;
- `rustfmt`, strict Clippy and compiler warnings gate every change;
- public contracts include runnable examples and architecture links;
- dependencies are minimal, pinned by the build lock, audited and licensed;
- unsafe code inside reviewed dependencies, such as SQLite FFI, is treated as a supply-chain risk
  and not confused with authored safety.

The implementation stack is:

- stable Rust, edition 2024;
- Tokio for bounded asynchronous process and adapter I/O;
- Clap for the CLI;
- Serde plus JSON Schema at portable boundaries, TOML for human configuration;
- `thiserror`-style domain errors and `miette`-style CLI diagnostics;
- bundled SQLite through `rusqlite`, behind the storage port;
- SQLx for the future Postgres/Neon adapter;
- `tracing` for structured local telemetry, with optional OpenTelemetry export.

No Temporal, Kafka, Redis, Kubernetes, vector database or hosted coordinator is introduced in v1.

## Observability

Every log event is structured and carries run, unit, attempt, transition revision and trace
identifiers where applicable. Logs describe lifecycle and diagnosis; proofs authorize outcomes.
The two are not interchangeable.

Required operational signals include:

- run and unit duration by state;
- human-wait and recovery duration;
- route rejections and semantic fallback rate;
- effect dispatch, retry, reconciliation and ambiguity counts;
- crash-resume count and recovery point;
- runtime startup, cancellation and protocol failures;
- proof completeness and certification failures;
- update check, staging, activation and rollback outcomes.

No full prompt, secret, credential, raw environment or unredacted provider payload enters logs.
Local telemetry is useful without an external account. Export is opt-in through an adapter.

## Testing and certification

### Development modes

- strict TDD for the core, state machine, permissions, effects, storage, migrations and updater;
- souple TDD for runtime adapters, CLI wiring and platform-specific packaging;
- exploratory spikes only when isolated, time-boxed and deleted before the production slice.

### Required test layers

1. example tests document every public domain contract;
2. unit tests cover pure transitions, policy and routing decisions;
3. property and model tests generate valid and invalid transition sequences;
4. fuzz tests target manifests, event streams, proof decoding and update metadata;
5. adapter contract tests run the same cases against every implementation;
6. every implemented storage adapter passes the same conformance suite; Postgres must match SQLite
   before the later Postgres/Neon adapter can ship;
7. process tests kill, timeout and cancel runtime process trees;
8. crash tests inject failure before and after each durable transition, outbox claim, remote call,
   reconciliation and activation step;
9. consumer fixtures install, migrate, update and roll back on macOS, Linux and Windows;
10. authorized real-runtime jobs certify Claude Code and Codex subscription paths;
11. an integrated full suite seals the exact tree before publication;
12. CI proof is accepted only when required checks are green on the exact integration SHA.

CI runs a bounded randomized fault matrix on every change. Nightly certification expands the seed
count and platform matrix. A failing seed is persisted as a deterministic regression test.

### Certification outcomes

For every injected crash point, the certificate must observe:

- zero duplicated authoritative effects;
- zero completed runs without their absolute proof;
- the same valid next transition after resume;
- no budget, permission or recovery-count bypass;
- an explainable terminal or resumable state.

"The process did not crash" is not the certificate. Correct behavior after a forced crash is.

## Migration sequence

The implementation plan must preserve working consumer behavior throughout these vertical slices:

1. freeze versioned contracts and build the native skeleton with no production routing;
2. implement state, event, outbox and proof core with crash certification;
3. implement SQLite and Git/worktree adapters and prove one local effect path;
4. implement skill manifests and deterministic routing, then semantic ranking;
5. certify Codex managed subscription execution for one skill;
6. certify Claude managed subscription execution for the same skill;
7. implement bounded human-timeout recovery and three-strategy enforcement;
8. migrate single-ticket `implement` and remove its old authoritative path;
9. migrate bounded `autopilot` through exact-SHA CI and `develop` merge;
10. introduce the native installer, exact project lock and journaled updater;
11. migrate existing consumers and prove rollback;
12. rename public product surfaces and reduce `voidharness` to the migration bridge;
13. remove the remaining legacy engine after the supported migration window.

Each slice has a single authoritative engine, consumer fixture, rollback and removal criterion. A
slice that only adds parallel machinery is incomplete.

## Linear reconciliation

Existing Linear work is absorbed rather than duplicated. No issue moves to Done from this design
alone. An issue closes only when its exact acceptance proof is present on `develop`; a partially
covered issue receives a comment and narrower remaining scope.

| issue | relation to this specification | close evidence |
|---|---|---|
| DEV-735 | deterministic plus semantic router | router conformance and degraded fallback |
| DEV-798 | single owner for run cursor and progress | crash-resume state certificate |
| DEV-803 | silent mechanism detection | proof refuses every missing required mechanism |
| DEV-706 | local seal versus exact-SHA CI proof | accepted proof contract and real CI certificate |
| DEV-733, DEV-734 | specialist panel belongs to orchestration | managed panel events and gate behavior |
| DEV-645 | semantic ownership for co-owned files | migration fixture preserving user content |
| DEV-452 | consumer migration conformance | current-to-native install/update/rollback matrix |
| DEV-450 | real Claude and Codex certification | signed exact-SHA runtime certificates |
| DEV-453 | self-host consumer release gate | native staged artifact certifies this repository |
| DEV-609, DEV-611 | project knowledge and regeneration | versioned knowledge plus disposable index tests |
| DEV-630 | update detection and proposal | signed check, activation and rollback evidence |
| DEV-631 | `.void` layout | migration to portable repo state plus OS-local state |
| DEV-659 | package and command naming | `void-machine` cutover and compatibility handoff |
| DEV-458 | extension seam | pack and adapter contract conformance |
| DEV-621 | resume CLI | durable restart from every certified crash point |
| DEV-623 | Workbench | name and port reserved; UI remains separately scoped |
| DEV-666 | backlog rationalization | superseded/absorbed issue audit after each slice |

DEV-591 and DEV-791 remain independent reliability defects unless their root cause is eliminated by
a specific slice. They are not closed by architectural replacement alone.

## Acceptance criteria

The foundation is complete only when all of the following are demonstrated from released artifacts:

1. a fresh generic Git repository installs with no Node.js, API key, database account or Void
   account;
2. one Codex subscription user and one Claude subscription user can each run the same routed skill;
3. setting the API ceiling to `0` makes API fallback mechanically impossible;
4. invalid or missing skill capabilities, permissions and runtime features fail before execution;
5. semantic routing failure still produces the same eligible deterministic route or a typed
   ambiguity;
6. every injected crash point produces no duplicate authoritative effect and resumes exactly;
7. a 15- or 20-minute unanswered reversible gate can recover, but a fourth strategy, irreversible
   decision, secret, production merge or over-budget action is refused;
8. current state, episodes, knowledge, skills and indexes can be independently inspected and the
   index rebuilt from authority;
9. every successful run verifies a complete proof bound to exact code, skill, runtime and CI SHAs;
10. a current `voidharness` consumer migrates, preserves user-owned content and can roll back to its
    prior known-good state;
11. a project stays on its pinned engine even when a newer launcher or engine is cached;
12. a bounded autopilot cluster integrates, seals the whole tree, passes CI on the exact SHA and
    merges to `develop` under explicit program consent;
13. no autonomous command or configuration can promote to the deploying branch;
14. the released native artifact passes the platform and real-runtime consumer certification
    matrix;
15. relevant Linear issues are reconciled from delivered evidence, not from matching terminology.

## Accepted foundation decisions

The following structural choices each have an immutable decision file:

1. same-history strangler migration versus a new repository;
2. native Rust kernel versus a Node or mixed production kernel;
3. OS-native local state versus `.void/local`;
4. SQLite-first authoritative storage with a Postgres/Neon adapter;
5. supervised assurance levels and the definition of proof-carrying execution;
6. TUF-rooted two-layer update architecture;
7. `Void Machine` product naming and `void-machine` command/package cutover;
8. official Claude Code process adapter with subscription as a release gate and API disabled by
   default;
9. portable `SKILL.md` paired with a Machine-owned executable `harness.yaml` manifest.

## Official sources consulted

Runtime behavior and tool configuration are grounded in current official documentation:

- [Agent Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx)
- [OpenAI Codex authentication](https://developers.openai.com/codex/auth)
- [OpenAI Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [OpenAI Codex CLI reference](https://developers.openai.com/codex/cli/reference)
- [Anthropic Claude Code authentication](https://code.claude.com/docs/en/authentication)
- [Anthropic programmatic/print mode](https://code.claude.com/docs/en/headless)
- [Anthropic environment variables](https://code.claude.com/docs/en/env-vars)
- [Anthropic CLI reference](https://code.claude.com/docs/en/cli-usage)
- [TUF overview](https://theupdateframework.io/docs/overview/)
- [TUF metadata model](https://theupdateframework.io/docs/metadata/)
- [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [cargo-dist configuration](https://axodotdev.github.io/cargo-dist/book/reference/config.html)
- [Node.js single executable applications](https://nodejs.org/api/single-executable-applications.html)
- [Node.js SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [rusqlite crate documentation](https://docs.rs/crate/rusqlite/latest)
- [SQLx crate documentation](https://docs.rs/crate/sqlx/latest)

The source review supports the stack choice but does not freeze third-party behavior. Runtime and
release adapters must revalidate installed versions during implementation and certification.
