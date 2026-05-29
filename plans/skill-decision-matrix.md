---
title: Skill Decision Matrix
date: 2026-05-29
status: skeleton
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

## Code-discipline skills (8)

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
- **Cannot decide**: tactical patterns (delegated to `functional` + `hexagonal-architecture`). Sub-domain analysis: deferred to `office-hours` / `plan-ceo-review` upstream.
- **Composes with**: `hexagonal-architecture`, `functional`.

### `code-review`

- **Wins**: pre-commit / pre-PR critical pass over a diff. Defects, missing tests, structure issues, security flags.
- **Loses to**: `senior-reviewer` (agent) for deep multi-aspect review. `security-reviewer` (agent) on security-specific concerns.
- **Cannot decide**: whether to ship (user). Architecture changes outside the diff scope.
- **Composes with**: `tdd` (verifies the cycle was respected), `typescript-strict` (verifies types), all hedges.

---

## Process skills (6)

### `brainstorming`

- **Wins**: any creative task before code. Feature scoping, design discussion, "should we build X this way?".
- **Loses to**: `office-hours` (gstack) when the question is "should we build X at all?" (upstream).
- **Cannot decide**: implementation specifics (defers to `writing-plans`). Sub-domain identification (defers upstream).
- **Composes with**: `writing-plans` (downstream).

### `writing-plans`

- **Wins**: turning an approved design into an executable plan. Sequencing, dependencies, verification gates.
- **Loses to**: `brainstorming` on intent and design choices.
- **Cannot decide**: feature scope (it's a planning skill, not a scoping skill). Architecture (defers to architecture skills).
- **Composes with**: `brainstorming` (upstream), `executing-plans` (downstream — gstack/superpowers).

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
- **Loses to**: `cso` (gstack) for full audit mode. `security-reviewer` (agent) for diff-level review.
- **Cannot decide**: full threat model (escalates to `cso`).
- **Composes with**: `hexagonal-architecture` (boundary discipline), `typescript-strict` (no untyped trust).

### `commit-discipline`

- **Wins**: every commit. Conventional commit format, "why" in the body, scope, breaking-change marking.
- **Loses to**: nothing — it's a final gate before the commit.
- **Cannot decide**: whether the change itself is correct.
- **Composes with**: `verification-before-completion`.

### `harness-evolution`

Two modes: `feedback` (inbound suggestions captured from real project usage) and `audit` (outbound obsolescence detection).

- **Wins (`feedback` mode)**: any moment, in any consumer project, when the model or user perceives a missing skill, missing rule, missing mention, or a hole in the harness coverage. Captured to `.voidcorp/harness-feedback/proposed/` in the *consumer project*.
- **Wins (`audit` mode)**: triggered by `npx @voidcorp/harness audit`. Reads `~/.voidcorp/usage.log`, scans upstream sources for deprecation, surfaces conflicts in the decision matrix.
- **Loses to**: nothing — it's a meta-skill operating on the harness itself, orthogonal to code-discipline and process skills.
- **Cannot decide**: whether a proposed change is adopted (HITL only). Cannot write into harness doctrine — only opens issues/PRs.
- **Composes with**: every skill (any skill can be the subject of feedback). Pairs naturally with `code-review` (a code review that surfaces a missing rule may generate a feedback item).

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
- **Cannot decide**: visual design (defers to design-consultation / design-shotgun in gstack).
- **Composes with**: `frontend-design` (enforces mobile-first dual-quality jointly).
- **Mobile-first dual-quality invariant**: every UI ships with verified keyboard nav AND verified touch interaction. Both pass the design-review skill before merge.

### `llm-cost-discipline`

- **Wins**: any code calling an LLM API. Prompt caching, batch, model selection, token budgets.
- **Loses to**: `security-guidance` on prompt-injection-aware design (data plane vs control plane).
- **Cannot decide**: model choice when quality is uncertain (escalates to `benchmark-models` in gstack).
- **Composes with**: `claude-api` (already exists in your skills).

### `frontend-design`

- **Wins**: any new UI component or layout. Anti-AI-slop rules, density, hierarchy, motion discipline, mobile-first layout design.
- **Loses to**: `design-consultation` (gstack) for design system creation. `design-review` (gstack) for live audits.
- **Cannot decide**: brand identity (DESIGN.md owns it).
- **Composes with**: `accessibility-first`, `typescript-strict`.
- **Mobile-first dual-quality invariant**: layout starts at 360–390px and is progressively enhanced. No desktop-only layout shipped without an equivalent mobile experience (or an explicit documented decision). Both viewports screenshot-reviewed before merge.

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

Skeleton populated for the 20 planned skills. To be refined as each skill's content is written in Section 11. Any cell that becomes ambiguous in practice triggers an ADR in `docs/DECISIONS.md`.
