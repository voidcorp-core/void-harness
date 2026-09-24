---
title: Supervised design orchestration and bounded arbitration
date: 2026-09-19
status: approved
review_status: prior-revision-reviewed-human-direction-amended
design_revision: amended-2026-09-19-new-core
author: Folpe + Codex
ticket: ''
related:
  - ../VOID-MACHINE-VISION.md
  - ../DECLIC-MACHINE-VISION-2026-09-13.md
  - ../NATIVE-SUPERVISION.md
---

# Supervised design orchestration and bounded arbitration

## Binding TypeScript port decision

The later explicit Folpe decision replaces Rust continuation with a bounded port
of existing capabilities to strict TypeScript on Node.js. See the
[port contract](../specs/2026-09-19-void-machine-typescript-port.md) and
[superseding ADR](../decisions-log/2026-09-19-void-machine-typescript-layer-ownership--e492e50e-86b0-4427-9fdf-2435750ce60d.md).
Order: close WORK-1/2/3; complete the isolated parity port; then execute the future
engine journey described below. Port parity does not certify that journey.
Historical inventory below is not functional certification. No release or active
installation change is authorized. The port contract owns its closed scope,
layer boundaries, compatibility, resource limits, review and completion criteria.

## Intent and status

Folpe chooses a lightweight conversational coordinator backed by deterministic
control, specialist agents and native runtime adapters. Brainstorm owns both the
exploration and its spec. Independent review challenges that spec before planning.
Ordinary disagreements should progress within delegated authority; consequential
human decisions must be surfaced. The earlier revision integrated three review corrections. The explicit human
decision below amends its architecture assumptions; the earlier review is not
claimed as review of these amended bytes. No implementation or gate change is claimed.

## New core decision (2026-09-19)

Authoritative design direction: [vision](../VOID-MACHINE-VISION.md#décision-du-19-septembre--un-noyau-neuf)
and [decision record](../decisions-log/2026-09-19-void-machine-new-core-demonstrated-needs--873d1c5a-ef12-44c7-84dd-2fcd853b7ab8.md).
Build the Void Machine core from this vision and the observed harness incidents.
Port its implemented capabilities to strict TypeScript with the ownership defined in the port contract. Harness architecture, control machinery and
bridges are not inherited requirements. Each reused mechanism must identify a concrete need,
its benefit, operating/maintenance/verification cost and a simpler alternative.
Record that reasoning in the design, not a new approval gate.

The afternoon spent unblocking WORK-1/2/3 is a counterexample, not a process to
productize. A control system harder to operate than the work it governs fails this
spec even when individual components are well designed.

The coordinator dispatches work, relays questions and collects results. The mission
runtime deterministically owns transitions, waits, recovery and closure; agent
runtimes retain native reasoning/session capabilities. Every wait has a structured
cause, responsible party and resolution action. A context supplement preserves the
mission, history and valid results without spending another round; only changes to
reviewed work invalidate dependent results. Reconcile ambiguous effects before replay.

A control blocks only on demonstrated security, permission, data-integrity or
acceptance consequences. Advisory remarks do not block. Bound reviews and verify
only the corrected points and affected invariants; do not restart a general audit.
Future evidence becomes blocking when its acceptance stage is due, not earlier.
Coding requirements belong to the coding vertical. The core contract is independent
of languages, frameworks, models, editors and presentation tools.

Persist decisions and useful state so a new coordinator needs no conversational
memory. Collect a finished agent's result, then close its owned panel; permanent
panels are protected and proof/worktree retirement follows separate ownership.
Finish the bounded WORK-1/2/3 delivery before implementation of this core. This
amendment adds no immediate controls to the harness and authorizes no release or
consumer installation update.

Concrete reuse prescriptions, module paths and numeric implementation defaults in
the earlier inventory are design hypotheses to reassess against this decision,
not an expansion of the bounded TypeScript port. Behavioral acceptance and existing data/permission
obligations remain binding. No rewrite of historical ADRs or mission events is allowed.

## Existing direction and evidence

The reference vision is `docs/VOID-MACHINE-VISION.md`, complemented by
`docs/DECLIC-MACHINE-VISION-2026-09-13.md`; `docs/VISION.md` is historical.
The former assigns state, permissions, budgets, evidence and cleanup to the kernel;
the latter explicitly separates coordinator, kernel, capability catalogue,
adapters and specialties. Native conversation memory stays with each runtime.

The pre-existing draft reports a Linear read on 2026-09-19 (not repeated by
this design pass; these statements are provenance, not fresh progress evidence):

- DEV-807 owns the foundation programme and its existing gates.
- DEV-820 (Done) describes deterministic eligibility before semantic ranking.
- DEV-609 (Done) separates durable knowledge, episodes and disposable indexes.
- DEV-815 (Done) bounds recovery; elapsed time cannot authorize forbidden effects.
- DEV-733 and DEV-734 (Done) describe orchestrator-owned independent review and
  managed implementation. DEV-641 (Backlog) identifies missing skill transitions.
- DEV-833 (Done) requires evaluating value against native execution, not agent count.

These tracker states do not prove this checkout contains every delivered path.
The foundation spec and plan paths referenced by DEV-807 are absent at checkout
HEAD 1efeedf1. Reconcile actual implementation and provenance before migration;
do not create another owner for routing, memory or mission transitions.

## Proposed responsibilities

- Coordinator: interpret intent, propose the applicable path, relay questions and
  answers faithfully, synthesize progress. It cannot waive gates or invent proof.
- Brainstorm specialist: clarify, compare ambitious and lateral alternatives,
  prepare and correct the spec while retaining its native context.
- Independent reviewer: fresh context, exact spec revision and relevant constraints;
  findings with evidence, consequence and proposed disposition. No authoring rights.
- Optional independent adjudicator: resolve a concrete disagreement, consider both
  arguments and recommend a disposition with rationale. No unilateral permissions.
- Kernel: admit routes, validate structured results, bind evidence to revisions,
  authorize transitions, bound attempts/resources, persist waits and decisions.
- Plan specialist: consume the accepted spec and decisions, then produce the plan.
  Ticketing and implementation follow their existing owners and contracts.
- Runtime adapter: launch/resume native execution, observe actual outcomes and
  preserve resume references. Model/provider/runtime are separate dimensions.
- Presentation adapter: optional owned display resources; no authority over task
  acceptance, permissions, merges, or worktree deletion.

## Review and arbitration

A fresh reviewer is required for the spec. A different eligible model is preferred
when available within the authorized capability/data/budget policy; diversity is
recorded as observed, never claimed from a prompt. Same-model fresh context is an
explicit fallback, not equivalent evidence of model diversity.

No findings requiring correction: the kernel may accept the reviewed revision under
an explicit delegated design policy. Correctable findings return to the original
author. A substantive unresolved disagreement invokes one fresh adjudicator within
a bounded review budget. Missing evidence causes evidence collection, not arbitration
by confidence or reviewer majority. Repeated debate cannot become unlimited retries.

The adjudicator is a probabilistic reasoner. Determinism belongs to validation and
authorization: given the same recorded inputs and policy, the kernel permits the
same transition. Persist the selected decision so a restart does not re-roll it.
No assurance is made that a model would independently regenerate the same judgment.

## Proposed delegated-authority boundary

Autonomous acceptance is restricted to the stated objective and approved constraints,
with bounded cost, preserved security/quality requirements and reversible effects.
Unclassified impact is not automatically low risk. An agent's self-rated confidence
cannot grant authority.

Escalate changes to the user's objective, protected project rules, permissions or data
exposure, spend beyond the agreed budget, irreversible effects, and deploying-branch
promotion. Existing explicit human gates remain until deliberately superseded.
A question needing human judgment carries options, trade-offs and the blocked step;
independent authorized work may continue. No timeout means consent.

## Decisions and memory

Record references to the alternatives, findings, disposition, rationale, evidence,
authority policy version and exact artifact revision. Store concise decision evidence,
not hidden reasoning or a duplicated raw conversation. Structural decisions become
ADRs through the existing collision-free mechanism. Routine dispositions remain
mission events; do not create an ADR per minor disagreement. Never attribute an
agent decision to a human approver. Accepted historical ADRs remain immutable.

## Supervision and lifecycle

Folpe's explicit clarification: implement mechanically decidable state, permission,
deadline, delivery and lifecycle handling as deterministic procedures. Keep model
reasoning, domain judgment and specialist instructions in versioned Markdown
artifacts; their outputs are inputs to validated runtime transitions, not direct
authority to perform effects. Do not duplicate procedural rules in model prompts.

The runtime owns the agent supervision sweep, not a permanently running LLM.
Consume native events and use a bounded periodic reconciliation for missed events
while the driver is active. An idle signal alone neither closes nor restarts an
agent. Reconcile it with durable assignment, pending question and result state:
surface the cause, responsible party and next action; collect final results before
retiring agents with no remaining action. Interrupted or missing agents preserve
continuity. Ambiguous state requests clarification rather than guessing completion.
An unresolved coordinator-owned wait becomes visible to the human after a bounded
delay, without unbounded repeated notifications. Presentation adapters close owned
panels only; branches, worktrees and proofs have independent lifecycles.

This is acceptance for the future engine after the bounded TypeScript parity port,
not an additional mechanism to implement in WORK-1/2/3 or in the port itself.

On a return, disconnect, deadline or resumption, reconcile the unit and its pending
action. Distinguish running, waiting for coordinator, waiting for human, failed,
result delivered, accepted and retired. Native idle/done is not task acceptance.
An accepted result is durably collected before its agent can be retired; retain
native references needed for later correction. Closing a display never removes a
worktree. Unknown outcomes are reconciled before repeated external effects.

There must be an execution driver consuming these transitions while the mission is
active; prose alone does not guarantee wakeups. Prefer native event/wait mechanisms.
The driver must report when the runtime cannot support continued supervision.

## Verification and migration requirements

Prove one request through brainstorm/spec, independent review, bounded disagreement,
accepted decision and plan, including interruption and restart. Negative cases cover
stale/duplicate returns, absent reviewer, unavailable model, invalid judgment,
permission widening, budget exhaustion, lost worker and unanswered human gate.
Prove closure of owned completed displays and preservation of permanent panels,
worktrees, proof and resume references. Run the same contract with no display adapter.

Measure manual interventions, unresolved waiting time, defects, complete mission
cost and recovered state against the existing workflow; more agents is not success.
Keep heavy local checks serialized or resource-budgeted.

The current brainstorm skill requires human spec approval. Replacing that universal
requirement with explicit delegated acceptance needs a bounded policy and a documented
migration, not a prose bypass. Inspect current routing/controller/memory code as evidence; reuse a mechanism
only after its concrete need and cost are justified against the new-core decision. Do not change the existing programme or create
duplicate Linear tickets from this design. The bounded policy and review budget
below resolve the design choices; runtime supervision still requires observed
conformance evidence before execution.


## Bounded mandate for this design

The explicit 2026-09-19 instruction authorizes acceptance of a spec after independent
review inside the approved objective and constraints, without systematic human
approval. It supersedes the human-approval step of brainstorm/plan for this mission,
not every installed skill or another project's policy. Brainstorm owns the spec;
ORCH owns coordination. The independent review was relayed in the follow-up
instruction; its three bounded corrections were integrated in the prior revision.
The accepted design is handed to ORCH for execution inside the existing mandate;
this amendment remains restricted to design records and their continuity references. No programme, ticket, installed skill, production code,
release, installation or deployment is changed by these documents.

Who benefits: the operator delegating design and execution, initially on a local
machine, later through Cortex. Current behavior: useful Rust coding guards and
TypeScript mission machinery exist, but no general Rust mission CLI or autonomous
design driver is demonstrated by this checkout. Desired behavior: one bounded
request produces a reviewed spec and a traceable plan, survives loss of conversation
context, and reports a concrete reason when it cannot proceed. Why now: prove the
small general kernel before expanding coding or choosing hosted infrastructure.
Done signal: a non-Git mission reaches accepted spec and plan, a forced restart
preserves its decision and pending action, then the coding vertical preserves all
existing worktree/effect/merge guarantees. More agents is not a success metric.

## Implementation inventory and migration ownership

Read against checkout HEAD `1efeedf1f018de907fa008b18c96fd0727d2ebfc` plus the
visible working tree on 2026-09-19. No test execution supports this inventory.

| Actual source | Observed responsibility | Candidate treatment, subject to justified reuse |
| --- | --- | --- |
| `native/void-machine/crates/core/src/lib.rs` | Health/skill reports, Git effect identities, fencing, observation validation, ambiguity | Candidate reuse; Git contracts are coding specialty, not mandatory general mission fields |
| `native/void-machine/crates/core/src/cluster.rs` | Ticket/file cluster reconciliation, review provenance, in-memory accepted set | Candidate reuse for coding; not a durable generic scheduler |
| `native/void-machine/crates/core/src/merge.rs` | Pure merge refusal/grant, SHA-bound checks/review, in-memory ledger | Candidate reuse; design acceptance never grants merge |
| `native/void-machine/crates/host/src/lib.rs` | Git repository discovery and state/cache paths | Evaluate coding discovery; general missions take an explicit workspace and state root without calling Git |
| `native/void-machine/crates/host/src/git_effect.rs` | Git observation and shared-repository mutation detection | Candidate coding-adapter reuse; do not move I/O into core |
| `native/void-machine/crates/adapters/src/lib.rs` | Doctor and skill package checks, renderers | Candidate protocol reference; no obligation to extend this implementation |
| `native/void-machine/crates/cli/src/main.rs` | Only doctor and skill-check command dispatch | Candidate distribution compatibility boundary |
| `packages/cli/src/lib/autopilot/durable-run-v1.json` | No-effect run schema, four phases, zero authoritative effects | Preserve v1 reader; new design review states need a separate versioned contract |
| `packages/cli/src/lib/autopilot/durable-run.ts` | SQLite state/events/outbox transaction, revisions, lease token, no-effect intent | Evaluate persistence mechanics via Node host; its four-state reducer cannot own the new mission transitions |
| `packages/mission-engine/src/routing/eligibility.ts` | Deterministic admission before semantic ranking; numeric money only | Evaluate as route authority; add explicit unknown cost semantics before using subscription telemetry |
| `packages/mission-engine/src/orchestration/review-loop.ts` | Revision/context-bound coding specialist completions and rounds | Evaluate evidence rules; do not pretend its pre/post-implementation stages already model design acceptance |
| `apps/eval-harness/src/runtime/` | Process and native specialist adapter evidence in private evaluation tooling | Reference conformance cases; never make published CLI import private app code |
| `docs/NATIVE-SUPERVISION.md`, `scripts/mission-presentation.mjs` | Optional local display helper, lifecycle rules | Keep display separate; helper is not an npm-installed supervisor |

The foundation documents referenced by DEV-807 are absent from this checkout as
reported in the inherited draft; no foundation content is reconstructed or treated
as approved here. The present native pivot spec/plan dated 2026-09-10 are useful
local references, not substitutes for those missing documents. ORCH must reconcile
conflicting accepted decisions before a cutover; a missing source blocks only the
migration it governs, not this bounded design.

One authoritative owner per responsibility is required. Extend the TypeScript candidate after proving existing capability parity. The mission
runtime owns its transitions. Native runtimes own their
reasoning/session continuity. Existing v1 records keep their current owner until an
explicit compatible migration; new missions must not introduce competing writers.
TypeScript on Node.js is the chosen implementation, not a constraint on supported
verticals, models or runtimes. Storage, routing and any cross-language bridge still
need justification from the delivered journey and their operating cost.

## Alternatives and delivery topology

Start with a local executable journey through an existing distribution entrypoint
where useful. npm distribution is a compatibility candidate, not a requirement to
reuse the harness Node control plane. The ported TypeScript candidate is the starting
point; npm packaging does not determine its architecture. Docker may later package a
service with an authenticated local executor, once the same mission contract and
actual hosting need justify pairing, transport and operational cost.

A native runtime conducting the whole design with Machine only observing results
is a useful comparison, but cannot guarantee deterministic recovery if its observed
capabilities do not provide it. The selected direction is a minimal mission core, extending the ported TypeScript
implementation, with native agent execution, not a new model reasoning loop or conversation
store. Provider interfaces and packaging configuration require official-source
verification when implemented. No Docker deployment is required for the first proof.

## General mission contract and authority

Version 1 of the new contract has these mandatory groups:

| Group | Required content |
| --- | --- |
| Identity | mission ID, unit ID, schema version, monotonic revision, namespace, local principal |
| Mandate | objective, constraints, allowed effects/data destinations, policy reference and digest, deadline, resource ceilings |
| Inputs | artifact references plus digests, source timestamps where meaningful, desired deliverable and acceptance predicates |
| Execution | role, capability/admission proof, effective-permission evidence, native session reference when observed, attempt ID, owner lease/fence, pending action ID |
| Evidence | output digest, input/mandate/policy digests, outcome and provenance; reviewer context and findings only when the selected workflow requires review |
| Resources | reserved/observed money, time, attempts and concurrency; unknown observations with reason |

Repository, ticket, branch, diff, stack, worktree and merge are absent from the general
required fields. Coding adds these through a specialty payload. A local principal is
not an authenticated hosted tenant; multi-client service authorization is deferred.
Every transition checks the mandate and current revision. Artifact text, including
review recommendations, is untrusted data and cannot become a permission grant.
Input changes invalidate downstream evidence even when the filename is unchanged.

Admission is not confinement. The catalogue says which capabilities exist; the
mandate says which actions/data destinations are authorized; the adapter must prove
which permissions are actually enforced for this invocation. Evidence binds runtime
version, configuration, tools, readable/writable paths, network destinations and
relevant descendant access to the mandate and route. A prompt restriction or a
capability label is not enforcement. Unknown, stale or insufficient mandatory
permission evidence blocks the route before any mission context is transmitted.
This applies to the coordinator and semantic ranker themselves, as well as author,
reviewer and executor. Recheck after configuration changes; an alternate accessible
tool must not bypass the claimed boundary. The kernel checks evidence and authority;
it does not claim to sandbox a runtime merely by admitting its route.

The general lifecycle is `admitted -> running -> delivered`, with reasoned wait,
reconciliation and terminal failure/cancellation states. Delivery predicates belong
to the selected workflow. A simple collection mission may read the two authorized
texts and return their references/digests without a spec, plan, reviewer or Git.
These artifacts and roles are not general mission requirements.

The **design workflow** specializes the running phase as
`drafting -> reviewing -> accepted -> planning`; `correcting` returns to `reviewing`
with a new digest and `disputed` permits one adjudication. `accepted` records spec
acceptance, not generic mission success. Its delivery predicate is a collected and
verified plan. `waiting-human`, `waiting-capability`, `paused-budget`, `reconciling`,
`failed` and `cancelled` preserve their reason and pending action in either workflow.
Delivery never implies code implementation or merge.

Design-spec acceptance requires independent review of the exact current spec, no unresolved
blocking finding, in-mandate disposition and remaining budget. A material dispute
may be disposed by the adjudicator only with evidence and within policy; missing
facts remain missing. Advisory findings are retained with disposition. Self-review
alone never satisfies independence. No response or invalid output cannot accept.

The author receives findings in its native session; the reviewer gets the spec,
mandate, sources and acceptance tests in a new context, not the author's conversation.
A third party sees both arguments only for a concrete disagreement. Different model
is preferred if admissible and available; observed same-model fresh context is valid.
A recommendation chooses `accept`, `correct`, `collect-evidence` or `outside-mandate`;
the kernel validates admissibility. It never reruns the model to seek a nicer verdict.

Default envelope for the first local demonstration: one active delegated role at a
time; one initial author pass, at most two correction passes, three review passes,
one adjudication and one plan pass (nine role dispatches maximum). Each dispatch has
a requested 15-minute deadline; the mission active-time admission budget is 120
minutes, including restart history. Enforcement after host loss is conditional on
the observed native mechanism specified below, not implied by these numbers. These
are proposed admission limits, not performance or post-crash termination claims. A smaller caller limit wins. Exhaustion pauses with a durable reason, never
adds budget. The API spend ceiling is zero unless separately granted. Reserve stop
and reconciliation time before admitting the next dispatch.

## First end-to-end journeys

**First acceptance, intention to delivered result:** use one non-Git mission and
real supported native execution. Begin with a bounded intention missing one useful
context detail. Request a precise clarification from its responsible party, retain
mission identity and valid results, then continue without an artificial review turn.
Interrupt execution after durable progress; resume the same mission with its prior
decision, artifacts, pending question/action and effects intact. Introduce one
concrete acceptance defect, correct it, recheck that point and affected invariants,
and deliver the requested artifact. Spec/plan are intermediate outputs unless they
are themselves the user's requested deliverable.

The evidence must show no lost work, replayed effect, duplicate valid specialist
work, redundant human approval or unbounded review loop. All waits expose cause,
owner and resolution action. Collect the finished agent's result and close only its
owned display; rerun the same behavioral contract without a presentation adapter.
Report elapsed time, active work, waiting by cause, model/tool cost with coverage,
and human interventions with their purpose. Unknown cost is explicit, not zero.
Distinguish necessary clarification from avoidable procedural approval. Compare
against direct native execution where comparable; do not claim improvement without
observations. An architecture reproducing the WORK-1/2/3 blocking process fails this
journey despite individually sound components. S1 and S2 together deliver this
first acceptance; an uninterrupted happy path alone is insufficient.


**First proof, design workflow without Git:** given a directory containing two
ordinary text sources and an explicit objective to prepare a design memo, start a mission from outside
any repository. The runtime reads only those sources and writes only the mission's
artifact directory. Brainstorm produces a spec with source references; a fresh
reviewer checks it; the kernel accepts the exact revision; plan produces the ordered
work and gates. In the recovery proof, interrupt the host immediately after durable
spec acceptance and before planning; restart and produce the plan from that same
acceptance without another reviewer or adjudicator call. Return artifact paths/digests
and observed review provenance. Separately run simple collection on these same two
texts to prove that the general lifecycle does not force design ceremony.
No Git command, ticket, project installation, coding test suite or remote write is
required. The fixture is text-based to prove generality without introducing Google
credentials, PDF rendering or Cortex pairing. Runtime calls may need network access
within their existing authorized subscription channel.

**Coding next:** give a repository and approved coding scope to the same mission
contract. The coding adapter resolves/reuses the ticket worktree, reads doctrine,
collects revision-bound tests/reviews and applies existing Git effect/cluster guards.
A result is accepted only against observed source state; changed files invalidate
proof. Commit-only work and existing promotion gates remain. The first coding demo
ends with a verified local result, not publication or production merge.

## Driver, persistence and recovery

The driver is an imperative host consuming persisted pending actions, not an LLM
loop. One lease holder per mission; each dispatch/result includes a fencing token,
input digest and action ID. A transaction records runtime-authorized next state, event
and outbox intent before dispatch. Adapter acknowledgments reconcile that intent.
Exactly-once external execution is not assumed: if launch acknowledgment is lost,
query by action/session reference; if unobservable, wait in `reconciling`, never
blindly relaunch. Repeated completion with the same identity is idempotent; a stale
fence or different digest cannot mutate current state.

The following timer/storage details are earlier implementation candidates, not
controls inherited by default; retain only those justified by a concrete failure
mode and measured operating cost. Use native events/waits first. Where unavailable,
the earlier candidate used bounded polling at five-second
intervals with at most one outstanding observation per mission is the local fallback.
A 30-second renewable lease with ten-second heartbeats fences competing supervisors;
lease expiry permits observation takeover, not automatic redispatch. Timer events
come from host observations, keeping core reducers pure. Failed cancellation retains
`reconciling` until termination is observed. A stopped host makes no claim of ongoing
supervision. Initial mode is foreground; no hidden daemon/cron installation.

A host timer, lease or fencing token cannot enforce a deadline after host failure.
The adapter must identify and observe the native deadline/cancellation mechanism,
its version/configuration, coverage of descendants and behavior when the supervisor
is killed. This checkout establishes no such native guarantee. If unavailable,
record `deadline_enforcement: not-guaranteed-after-host-loss`; retain the dispatch's
resource reservation and refuse all new delegation for the affected mission until
reconciliation proves termination and accounts for usage. Other missions cannot
consume that reserved capacity either. Do not free a slot or
budget on elapsed time alone. Unknown usage remains reserved, not refunded. The
operator sees the unbounded-after-crash exposure. A mandate requiring a hard bound
across host failure makes that route inadmissible; only a mandate allowing this
explicit limitation can use it. Observed termination can release concurrency, while
unknown monetary usage still retains its monetary reservation. Recovery does not
retroactively turn the requested deadline into an enforced one.

Persist under an explicit mission state root outside the source workspace; reject
state roots overlapping source inputs or symlink escapes. The initial caller supplies
that path, so general missions need no home-directory or Git discovery. SQLite state,
events and outbox form one operational record; telemetry is a derived projection.
Artifacts are written atomically before their reference is committed. On startup,
verify schema and referenced digests, acquire a fresh fence, inspect unresolved
intents, query native sessions, then resume the pending action. Corruption or unknown
schema preserves bytes and stops; it never resets progress silently.

| Information | Source of truth on resume |
| --- | --- |
| Objective and approved constraints | Recorded mandate and versioned project sources |
| Spec, plan, decisions | Authored artifacts plus recorded exact digests; structural ADRs in repository |
| Conversation and compaction | Native runtime session; Machine stores references only |
| Mission actions and acceptance | Transactional mission record, lease and decision evidence |
| Delivery progress for the existing programme | Linear, not these documents or a checkpoint |
| Git/worktree reality | Git observation, not pane metadata |
| Cost/model/context usage | Runtime observations with provenance or explicit unknown |
| Display identity | Presentation adapter's owned handles; never task authority |

If native resume is unavailable, supply the minimum handoff: mandate, source/artifact
references, decisions, effects, pending action and outstanding evidence. Record context
loss. Do not regenerate the accepted decision or copy the raw conversation. Native
session loss does not erase a previously persisted accepted spec; it may prevent
safe repetition of an ambiguous action.

Display cleanup follows durable result collection and confirmed completion of the
assigned task, for owned completed surfaces. An agent process still sitting at its
interactive prompt is not a reason to retain a completed owned panel; retain its
resume reference separately when useful. Preserve coordinator/permanent/shared
panels and unfinished sessions. Worktrees belong to coding units and survive failed
runs; removal follows verified merge and the existing lifecycle policy, never display
closure. Cleanup failures are explicit retryable records, separate from result validity.

## Cost, telemetry, bounds and rollout

Money, subscription quota, elapsed time, tokens, context and local concurrency are
separate dimensions. Each observation is known-with-source or unknown-with-reason;
unknown is neither zero nor unlimited. A strict monetary ceiling requires a provable
reservation/upper bound for that paid route; otherwise it is inadmissible. A configured
subscription route can run with money/quota telemetry unknown only when no enforceable
numeric quota claim is made and the mandate accepts the observed enforcement
limits. Attempt/concurrency admission stays bounded; time after host loss is not
guaranteed without the native mechanism above. Reservations survive uncertainty.
No subscription exhaustion falls back to a paid API implicitly. Descendant agent
usage must be included or marked unobservable; uncontrolled descendant delegation is
inadmissible under this demonstration's concurrency limit.

Record dispatches, accepted/stale returns, waits by reason, review rounds, cancellation,
cleanup and unknown coverage. Never log prompts, raw documents, secrets or hidden
reasoning. Compare with direct native execution on the same fixture: interventions,
completion, defects, active/wall latency and observed cost coverage. No economic
superiority is claimed without comparable observed data.

Earlier candidate bounds, to justify from the mandate and measurements rather than
inherit as universal controls: 64 source/artifact references per unit, 1 MiB structured result,
1,024 pending events per mission; reject excess with an explicit limit error before
allocation/dispatch. Stream diagnostic output with a bounded retained tail. Input
text stays in the authorized workspace; the journal records references and decisions.
Resource sketch: network/model latency dominates the sequential review path; disk
holds small transactional records plus artifacts; memory bounds follow result/event
limits; CPU hashes input bytes linearly. Measure these on the fixture before raising
limits. No speculative scheduler, learning policy or index is required.

Roll out only through an explicit new command; legacy npm install/update/doctor
behavior stays under existing conformance tests. Missing native binary or incompatible
protocol produces a useful blocked result, not a download/build or TS shadow reducer.
Rollback disables new admissions and preserves existing records; older binaries refuse
new schemas. Do not downgrade or reinterpret an active record to run it on v1.

## Acceptance evidence and structural decisions

Required first journey: intention, clarification, interruption, focused correction
and delivered result with time/cost/human-intervention evidence as above. Additional
targeted scenarios protect distinct useful behaviors: two-text design without Git; interrupt after acceptance and
resume planning without new judgment; simple collection without spec/review/plan;
capability available but effective permission unknown (zero context sent, including
coordinator/ranker); host crash with native deadline proved or explicitly unguaranteed,
reservation retained and new delegation refused until reconciliation; one correction; one dispute; absent/fresh
same-model reviewer; stale digest; duplicated return; malformed/oversized output;
forbidden destination before any data transfer; zero API spend; unknown telemetry;
budget stop; lost launch acknowledgment; restart before/after transaction; expired
lease; cancelled native execution; missing native session; display-free execution;
owned display cleanup without worktree deletion; coding regression and npm preservation.
A fixture adapter proves mechanics; one observed native subscription run is additionally
required before claiming live supervision. It must report exact runtime/version and
continuity limitations. No fake adapter result may stand in for that evidence.

Structural decisions to record only where the implementation commits the choice:

| Decision | Selected boundary | Credible alternative and consequence |
| --- | --- | --- |
| Transition authority and persistence | Extend the ported TypeScript mission core; one writer per mission; storage/bridges justified by demonstrated needs | Inherit Rust/Node bridge or port all legacy code: either can import unneeded mechanisms and operating cost |
| Durable mission state | Keep operational state/artifacts until explicit safe retirement, separate disposable telemetry | Treat all observed data as disposable: simpler cleanup, loses pending effects and accepted decisions on restart |

These are actual ownership choices deserving collision-free ADRs at implementation,
not a prerequisite to every slice or an ADR per guard. The mission-specific delegation
grant is already explicit; record its provenance in the mandate, not a new generic
approval doctrine. A future change to universally shipped skill authority would be
a separate structural decision. Local-first versus hosted executor alternatives are
compared above; no Docker ADR is required before the local proof. If an existing
accepted ADR already owns a choice, reference it rather than duplicate it; supersede
only a genuine conflict. The new-core direction is recorded in the linked ADR; no per-control ADR is required.

For the local slice, nonterminal state and accepted artifacts have no automatic
expiry. Explicit operator retirement preserves native references until no correction
is pending. Hosted tenant retention remains out of scope.

## Prior independent review and subsequent human amendment

The follow-up instruction relays independent review and requests exactly three
corrections. All are accepted and integrated: (1) capability/admission versus proven
effective permissions before context, (2) design workflow separated from general
mission lifecycle, (3) native deadline evidence or explicit host-loss limitation with
retained reservations and refused new delegation. The two-text proof now interrupts
after acceptance and resumes without another judgment. No substantive disagreement
remains to send to a third-party adjudicator.

Status `approved` records the supplied independent-review disposition and authorized
bounded corrections, not an invented second review of these final bytes. Reviewer
identity/model and a separate review artifact were not supplied; none is invented.
ORCH retains that provenance. The later explicit human direction and TypeScript-port
clarification amend this spec and its plan; the prior review is not claimed as
review of the amended bytes. No implementation, runtime conformance, build or test
is claimed by this documentation change. No further
systematic human approval is requested inside the mandate.
