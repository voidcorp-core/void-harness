---
title: Skill Decision Matrix
date: 2026-05-29
status: current
owner: void-harness/core
purpose: For every skill in core, specify when it wins, when it loses, and what it is NOT allowed to decide. Prevents overlap and silent contradictions between skills.
---

# Skill Decision Matrix

This matrix is the precondition to writing per-skill content (Section 11 of the master design spec). Without it, skills like `functional`, `hexagonal-architecture`, `domain-driven-design`, `testing`, `refactoring`, and `code-review` will overlap, contradict each other, or silently fight for the same decisions.

**How to read each row**

- **Wins**: this skill is the primary authority when the task matches this trigger
- **Loses to**: when these other skills are in play, defer to them on their domain
- **Cannot decide**: explicit list of decisions the skill must escalate or defer; protects the boundary
- **Composes with**: skills that run together without conflict (sequenced or parallel)

---

## Code-discipline skills (9)

### `tdd`

- **Wins**: any implementation of new behavior, bugfix, refactor that changes observable behavior
- **Loses to**: `refactoring` for pure refactor mode (no behavior change). `migrations-safety` for DB migration mechanics.
- **Cannot decide**: what the production code architecture should be (defers to `hexagonal-architecture`, `domain-driven-design`); naming (defers to `typescript-strict`); test ergonomics within a framework (defers to `testing`).
- **Composes with**: `testing` (TDD provides the cycle, testing provides the technique), `refactoring` (R of RED-GREEN-REFACTOR delegates here).

### `typescript-strict`

- **Wins**: every TypeScript file. Types, signatures, exhaustive switches, `unknown` vs `any`, narrowing patterns.
- **Loses to**: `functional` on data-shape choices (immutability, ADTs). `domain-driven-design` on domain modeling.
- **Cannot decide**: business logic, test strategy, architecture boundaries.
- **Composes with**: every other skill (it's the language baseline).

### `functional`

- **Wins**: data flow design, error modeling (`Result<T, E>` over throwing), pure-by-default decisions, ADT design (sum types).
- **Loses to**: `hexagonal-architecture` on whether to use FP at the boundary or the inside. `typescript-strict` on type expression details.
- **Cannot decide**: I/O strategy (defers to hexagonal), persistence shape (defers to DDD), test discipline.
- **Composes with**: `typescript-strict` (provides ADT machinery), `domain-driven-design` (Wlaschin makes them friends).

### `refactoring`

- **Wins**: any change that improves structure without changing observable behavior. Tidy-First moves.
- **Loses to**: `tdd` if any behavior changes. Refactoring stops at the boundary of behavior change.
- **Cannot decide**: whether a refactor is worth the cost (escalates to user — taste call). New design (defers to `hexagonal-architecture`, `domain-driven-design`).
- **Composes with**: `tdd` (R step), `code-review` (suggests refactors).

### `testing`

- **Wins**: how to express a test once you know what to test. Mocking strategy, fixture design, test pyramid placement, integration vs unit choice.
- **Loses to**: `tdd` on **when** to write the test (always: before). `migrations-safety` on testing DB changes.
- **Cannot decide**: whether a feature deserves a test (TDD's call: yes, always, in strict mode). Production architecture.
- **Composes with**: `tdd` (provides the cycle), `mutation-testing` (validates the test quality).

### `hexagonal-architecture`

- **Wins**: boundary between domain logic and I/O. Port/adapter design. Where to inject vs hardcode.
- **Loses to**: `domain-driven-design` on what the domain *is*. `functional` on data shapes inside the domain.
- **Cannot decide**: which framework to use (Next, Express, etc. is a `pack-*` concern). DB schema design.
- **Composes with**: `domain-driven-design`, `functional`, `tdd`.

### `domain-driven-design`

- **Wins**: identifying bounded contexts, aggregates, ubiquitous language. Anti-corruption layers between domains.
- **Loses to**: `hexagonal-architecture` on the technical boundary mechanism. `functional` on data shapes within an aggregate.
- **Cannot decide**: tactical patterns (delegated to `functional` + `hexagonal-architecture`). Sub-domain analysis: deferred to `brainstorming` / `plan-review` (CEO lens) upstream.
- **Composes with**: `hexagonal-architecture`, `functional`.

### `code-review`

- **Wins**: pre-commit / pre-PR critical pass over a diff. Defects, missing tests, structure issues, security flags.
- **Loses to**: `doctrine-critic` (agent) for doctrine-conformance review. gstack `/cso` on security-specific concerns.
- **Cannot decide**: whether to ship (user). Architecture changes outside the diff scope.
- **Composes with**: `tdd` (verifies the cycle was respected), `typescript-strict` (verifies types), all hedges.

### `api-and-interface-design`

- **Wins**: designing the contract of any public interface — package exports, HTTP/REST, RPC/tRPC, SDK, module boundary consumed by others. Surface shape, stability, versioning, error contract.
- **Loses to**: `hexagonal-architecture` on boundary placement and dependency direction. `domain-driven-design` on the vocabulary and aggregate model. `typescript-strict` on type-expression details.
- **Cannot decide**: internal implementation behind the contract; which transport/framework to use (pack concern); whether a breaking change is worth its cost (user / ADR).
- **Composes with**: `hexagonal-architecture` (draws the domain's ports well, seen from outside), `typescript-strict` (boundary types), `functional` (`Result` at the boundary), `security-guidance` (input validation), `async-safety` (idempotency, pagination), `domain-driven-design` (ubiquitous names in the contract).

---

## Process skills (15)

### `brainstorming`

- **Wins**: any creative task before code. Feature scoping, design discussion, "should we build X this way?" — and, via the vendored upstream mode (DEV-386), "should we build X at all?" (demand pressure-test + 10x ambition).
- **Loses to**: `plan-review` (CEO lens) for reviewing a written plan's premise / ambition / trajectory.
- **Cannot decide**: implementation specifics (defers to `writing-plans`).
- **Composes with**: `writing-plans` (downstream).

### `writing-plans`

- **Wins**: turning an approved design into an executable plan. Sequencing, dependencies, verification gates.
- **Loses to**: `brainstorming` on intent and design choices.
- **Cannot decide**: feature scope (it's a planning skill, not a scoping skill). Architecture (defers to architecture skills).
- **Composes with**: `brainstorming` (upstream), `executing-plans` (downstream — gstack/superpowers).

### `plan-review`

- **Wins**: critiquing a written plan before execution through four lenses (CEO premise/ambition, Eng test-coverage/failure-modes, Design states/slop, DevEx TTHW); the `all` mode orchestrates them with auto-decisions.
- **Loses to**: `writing-plans` on authoring/structuring the plan (plan-review proposes findings, the author disposes); `code-review` once code exists.
- **Cannot decide**: the idea's demand (that is `brainstorming`); it never rewrites the plan or auto-decides taste/user-challenge calls.
- **Composes with**: `writing-plans` (upstream, produces the artifact), `ticket-runner` (downstream), `frontend-design`/`impeccable` (Design lens), `security-audit` (Eng lens routes deep security). Vendored from gstack plan-reviews + autoplan (DEV-385).

### `systematic-debugging`

- **Wins**: any bug, test failure, unexpected behavior. Root-cause investigation before fix.
- **Loses to**: `migrations-safety` on migration-specific failures. `observability` on missing-logs cases (fix the visibility first).
- **Cannot decide**: whether to ship a fix without root cause (Iron Law: no). The fix itself (delegates to `tdd`).
- **Composes with**: `tdd` (write the failing test that reproduces, then fix).

### `verification-before-completion`

- **Wins**: every "task complete" claim. Pre-flight checklist before reporting done.
- **Loses to**: nothing — it's the final gate.
- **Cannot decide**: what "complete" means functionally (the task itself defines that).
- **Composes with**: all other skills (runs after).

### `security-guidance`

- **Wins**: any trust-boundary code (input validation, auth, secrets, SQL, LLM input/output). Default-secure patterns.
- **Loses to**: `cso` (gstack) for full audit mode. `doctrine-critic` (agent) flags trust-boundary code in a diff.
- **Cannot decide**: full threat model (escalates to `cso`).
- **Composes with**: `hexagonal-architecture` (boundary discipline), `typescript-strict` (no untyped trust).

### `commit-discipline`

- **Wins**: every commit. Conventional commit format, "why" in the body, scope, breaking-change marking.
- **Loses to**: nothing — it's a final gate before the commit.
- **Cannot decide**: whether the change itself is correct.
- **Composes with**: `verification-before-completion`.

### `learning-capture`

The 2026-07-09 fusion of `compounding` + `capture-rule` + `harness-evolution` (issue #75) — one skill, three routed destinations, HITL on every write.

- **Wins**: any moment a lesson appears — a stated durable project rule, a recurring/deja-vu fix, an end-of-cycle pattern, or a perceived harness gap. Names the lesson, decides scope, and runs the matching capture: a project rule into `.void/PROJECT-DOCTRINE.md`, a harness gap as a direct `voidcorp-core/void-harness` issue, or drop. Also interprets the `void-harness audit` obsolescence report.
- **Loses to**: nothing on capture routing — it is the single owner. Defers *which tool to use* to the code skills; a structural decision with a rejected alternative is `adr-workflow`, not a doctrine line.
- **Cannot decide**: whether a capture is adopted (HITL only, never auto-writes doctrine); whether a rule is correct (the user owns it); the scope when genuinely ambiguous (it asks, never guesses).
- **Composes with**: `verification-before-completion` (a cycle is not "closed" until verified), `commit-discipline` (a project rule commits as `docs(doctrine):`), `code-review` (a recurring finding is a deja-vu signal), `claude-md-authoring` (governs the doc a rule lands in), `adr-workflow`, `retrospective` (feeds it window-scale patterns).

### `retrospective`

- **Wins**: a periodic engineering retro over a window (a week, a cycle) — reads git log / PRs / `.void/`, surfaces signals (commit-type mix, hotspots, recurring-fix files, test-to-prod ratio, PR size, regressions), and turns them into concrete improvement decisions.
- **Loses to**: `learning-capture` on writing a lesson into doctrine (the retro routes patterns to it, never writes doctrine itself); `systematic-debugging` on fixing one bug (the retro only flags the recurring-file smell at window scale).
- **Cannot decide**: whether a capture is adopted (HITL via learning-capture); it never changes code or writes doctrine.
- **Composes with**: `learning-capture` (durable patterns routed there), `systematic-debugging` (recurring-fix smell), `writing-plans` (large-PR window = slicing signal). Vendored from gstack `/retro` (DEV-396) with the gamification dropped.

### `source-driven-development`

- **Wins**: before writing any config or usage of a third-party tool, framework, library, or API. Grounds the decision in the official docs for the *installed* version, not training memory; cites the reference.
- **Loses to**: `brainstorming` / `adr-workflow` on *which* tool to choose (this skill grounds *how to use* the chosen one).
- **Cannot decide**: tool selection; the design (defers to `writing-plans`); business logic.
- **Composes with**: `writing-plans` (grounds stack decisions), `commit-discipline` (the "why" carries the source citation), `adr-workflow` (rejected alternatives cite official docs), `context-management` (delegate heavy doc-reading to a fresh-context subagent).

### `context-management`

- **Wins**: managing the context window — `/clear` between unrelated tasks, `/compact <focus>` on long sessions, the two-correction reset, delegating heavy investigation to fresh-context subagents, keeping task state on disk.
- **Loses to**: `systematic-debugging` on the investigation *method* (this skill owns *where* the investigation runs, not how).
- **Cannot decide**: the task content; the investigation's conclusions.
- **Composes with**: `systematic-debugging`, `writing-plans` (plan state persisted on disk), `dispatching-parallel-agents` / `subagent-driven-development` (vendored targets).

### `adr-workflow`

- **Wins**: documenting a structural decision that changes how future code is written, with a credible rejected alternative. ADR format, numbering, and lifecycle (proposed → accepted → superseded). Promoted from pack-monorepo to core on 2026-06-04.
- **Loses to**: `writing-plans` on the *work* plan (an ADR records the *decision*, not the steps).
- **Cannot decide**: product / org strategy (Notion, Linear); the work sequencing (`writing-plans`).
- **Composes with**: `writing-plans`, `commit-discipline` (a one-paragraph "why" should become an ADR), `source-driven-development` (alternatives cite docs), `harness-evolution` (harness ADRs live in this repo).

### `claude-md-authoring`

- **Wins**: writing or auditing a project CLAUDE.md / AGENTS.md. Length budget, what belongs vs what goes to hooks/linters, `file:line` over snippets, progressive disclosure, runnable-first-try.
- **Loses to**: `capture-rule` on writing an individual project rule (this skill governs the *document*, not the single rule). `harness-evolution` on harness-level doctrine.
- **Cannot decide**: the project's actual rules (the user owns content); deterministic enforcement (that belongs in hooks/settings, which is precisely the point).
- **Composes with**: `context-management` (the doc is part of the context budget), `source-driven-development`, `capture-rule` (where a rule lands), `harness-evolution` (the harness produces consumer CLAUDE.md files).

### `backlog-autopilot`

The single in-session backlog drainer; consolidates the former `backlog-batch` and the deleted `autonomous-backlog-loop`.

- **Wins**: an explicitly launched run draining a Linear pool into clean PRs — today the **attended** parallel burst (several **independent** tickets, each in its own worktree subagent, reconciled into one integration PR); cluster auto-detection, an adaptive per-ticket cycle, multi-cluster autonomy and risk-gated auto-merge are being added. Opt-in only; needs the Workflow tool.
- **Loses to**: any single-ticket interactive session; human judgment on the plan and on merge.
- **Cannot decide**: whether two tickets truly overlap (the footprint is *estimated*; the reconciliation subagent + full suite are the backstop); whether to merge a risky cluster or a stack root (human, unless `--auto-merge` + green CI on a low-risk cluster).
- **Composes with**: the Workflow tool (substrate), `using-git-worktrees`, the craftsman cycle inside each worker (`brainstorming`, `source-driven-development`, `writing-plans`, `tdd`, `verification-before-completion`, `commit-discipline`, `learning-capture`, `context-management`); `ticket-writer` upstream (which may ingest a `source: forge` spec), `/code-review` + `/ship` downstream (human-owned merge).

### `ticket-runner`

The single canonical definition of "execute one ticket well" — one ticket taken from ready to shipped with a senior team's coverage (architecture, TDD, e2e, UX, security, review, verification), each pass keyed to an observable predicate.

- **Wins**: taking a single ready ticket through to a shipped/green branch. Both interactive single-ticket work and each `backlog-autopilot` worker delegate here, so the cycle is defined once.
- **Loses to**: `writing-plans` on sequencing *several* tickets; `ticket-writer` on authoring the ticket; human judgment on merge.
- **Cannot decide**: whether a triggered pass may be skipped (never — the predicate decides, not a vibe); whether to merge (human).
- **Composes with**: every code-discipline and process skill (it is the conductor that invokes them per predicate); `ticket-writer` upstream, `backlog-autopilot` as caller.

### `ticket-writer`

Turns a finished brainstorm, plan, or design decision into a tracker ticket an implementation agent can execute with zero follow-up — every required slot filled, estimated, labelled.

- **Wins**: capturing an already-made decision as a trackable, self-contained work item; declaring which `ticket-runner` passes to expect.
- **Loses to**: `brainstorming` / `writing-plans` on producing the thinking (it records, never invents scope); `ticket-runner` on execution.
- **Cannot decide**: the scope itself (ingests it from upstream); the estimate's business priority (user).
- **Composes with**: `brainstorming` + `writing-plans` upstream, `ticket-runner` downstream (consumes the ticket and its declared passes).

---

## Hedge skills (6)

### `observability`

- **Wins**: any code that runs in production. Logging structure, trace IDs, error boundaries, metrics emission.
- **Loses to**: `security-guidance` on what NOT to log (PII, secrets).
- **Cannot decide**: alerting policy (ops concern).
- **Composes with**: every code-discipline skill.

### `migrations-safety`

- **Wins**: any DB schema change. Backfill strategy, locking analysis, rollback plan, two-phase changes.
- **Loses to**: nothing on its own domain. Stand-alone discipline.
- **Cannot decide**: schema design (defers to `domain-driven-design`).
- **Composes with**: `tdd` (test the migration), `observability` (log the change).

### `async-safety`

- **Wins**: concurrent code, retries, webhooks, jobs, distributed coordination. Idempotency design.
- **Loses to**: `hexagonal-architecture` on where the async boundary sits.
- **Cannot decide**: queue technology (pack concern).
- **Composes with**: `observability` (traces), `security-guidance` (replay attacks).

### `accessibility-first`

- **Wins**: any interactive UI. Keyboard nav, ARIA via Radix, contrast, semantic HTML, touch targets ≥ 44×44px, focus management.
- **Loses to**: nothing on accessibility. It's the floor, not the ceiling.
- **Cannot decide**: visual design (defers to `frontend-design` / `ui-review` + the `DESIGN.md` contract; recon/variants to `forge`).
- **Composes with**: `frontend-design` (enforces mobile-first dual-quality jointly).
- **Mobile-first dual-quality invariant**: every UI ships with verified keyboard nav AND verified touch interaction. Both pass `ui-review` before merge.

### `llm-cost-discipline`

- **Wins**: any code calling an LLM API. Prompt caching, batch, model selection, token budgets.
- **Loses to**: `security-guidance` on prompt-injection-aware design (data plane vs control plane).
- **Cannot decide**: model choice when quality is uncertain (escalates to `benchmark-models` in gstack).
- **Composes with**: `claude-api` (already exists in your skills).

### `frontend-design`

- **Wins**: any new UI component or layout. Anti-AI-slop rules, density, hierarchy, motion discipline, mobile-first layout design.
- **Loses to**: the `DESIGN.md` contract for system creation; `ui-review` for the audit/critique pass (this skill is build-time, ui-review is audit-time).
- **Cannot decide**: brand identity (DESIGN.md owns it).
- **Composes with**: `accessibility-first`, `typescript-strict`.
- **Mobile-first dual-quality invariant**: layout starts at 360–390px and is progressively enhanced. No desktop-only layout shipped without an equivalent mobile experience (or an explicit documented decision). Both viewports screenshot-reviewed before merge.

### `ui-review`

- **Wins**: auditing/critiquing/polishing an EXISTING UI. The AI-slop two-altitude test, squint test, interaction-state coverage, technical audit (contrast/a11y/responsive/perf), refine modes (polish/bolder/quieter/distill/harden).
- **Loses to**: `frontend-design` on the build-time rules (this skill assumes and checks against them, does not restate them); `forge` on market recon + scored 12-dim critique + design prompts.
- **Cannot decide**: brand identity (DESIGN.md); it does not rewrite a UI wholesale (findings + scoped refine only).
- **Composes with**: `frontend-design` (build floor to this audit ceiling), `accessibility-first` (a11y dimension), `forge` (recon/critique/prompt via the `source: forge` artifact contract). Vendored from impeccable + gstack design-review (DEV-389); live-browser audit deferred to Vague 4.

---

## Cross-cutting boundary rules

These are global rules that apply across all skills:

1. **No skill modifies architectural decisions logged in DECISIONS.md without escalating.** The architecture skills `propose`; the user `decides` and records.
2. **No skill writes to project CLAUDE.md.** Learnings go to `learnings/proposed/`. Only explicit promotion (via `voidcorp:learnings-promote` or manual edit) updates doctrine.
3. **No skill silently overrides another.** If a skill detects it should defer, it announces "deferring to `X` because Y" and invokes X.
4. **No skill claims completion of work that belongs to gstack** (QA, design, ship, browser interactions). These are explicitly out of scope.

---

## Conflict resolution

When two skills both claim "I win":

1. **Tactical conflict** (e.g., `tdd` vs `refactoring` on a mixed diff): the user is asked which intent applies, and the diff is split if necessary.
2. **Strategic conflict** (e.g., `functional` says "pure" but `hexagonal-architecture` says "side-effecting adapter here"): the architecture skill wins on boundary placement, the implementation skill wins inside the boundary.
3. **Unresolvable**: stop, escalate to user with both positions stated explicitly.

---

## Status

Populated for the 29 core skills as of 2026-07-09 — the code-discipline (9), process (14, including the canonical `ticket-runner` cycle, `ticket-writer`, and the fused `learning-capture`), and hedge (6) groups above. `backlog-autopilot` replaced the deleted `autonomous-backlog-loop`; `learning-capture` fused `compounding` + `capture-rule` + `harness-evolution` (issue #75). Refined as each skill's content evolves; any cell that becomes ambiguous in practice triggers an ADR in `docs/DECISIONS.md`.
