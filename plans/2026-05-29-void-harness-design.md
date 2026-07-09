---
title: void-harness — Design Spec v1 (work in progress)
date: 2026-05-29
status: in-design
author: Folpe (with Claude Opus 4.7)
related: README.md, docs/PHILOSOPHY.md, docs/ARCHITECTURE.md
---

# void-harness — Design Spec v1 (work in progress)

This document captures the design of the **void-harness** Claude Code harness, currently in brainstorming. It will be promoted from `in-design` to `approved` once all sections are validated. Sections marked `[PENDING]` are not yet covered — the brainstorming is paused here so we can checkpoint progress to the repo.

## Intent

Build a Claude Code harness — distributed as `@voidcorp/harness` on npm — that makes **every new VoidCorp project arrive at the top-5% quality bar automatically**. Inspired by `citypaul/.dotfiles` (the gold standard), TigerStyle (TigerBeetle), `superpowers`, `compound-engineering-plugin`, `tdd-guard`, and the DECLIK `tdd` skill (already top-5%, ported here).

The harness must:

- Enforce craftsman discipline by default (TDD strict, TigerStyle hard rules, hexagonal/DDD, refactor discipline, security-aware)
- Be modular: a **TypeScript/web-first** core (assumed, not agnostic) + pluggable packs per stack (Next.js PWA, monorepo, mobile in future). See Section 0bis for the stack assumption.
- Be enforced mechanically with **explicit bypasses for legitimate exceptions** (refactor pur, deletion, config, fixtures, migrations, spikes, codemods). See Section 0bis.
- Be measured: skill tests in CI, anti-bloat hard limits
- Improve over time via **a proposed-learnings queue** (`learnings/proposed/`) promoted to project doctrine only by explicit review — never auto-written into CLAUDE.md. See Section 0bis.

## Section 0bis — Critical-review intake (2026-05-29)

The design was put under critical review on 2026-05-29. Seven hedges were raised. Six are integrated below; one was explicitly rejected by the project lead.

### 0bis.1 — Stack assumption made explicit (was: "core agnostic")

The core is **not stack-agnostic**. It assumes **TypeScript + web** by design: TS strict types, Zod at boundaries, React/Next mental model, `tsc --noEmit`, vitest-style test discovery, TigerStyle naming conventions adapted for typed languages.

Pretending universal agnosticism would dilute the design. The honest framing:

- **`core/`** = TypeScript + web first. Every skill in core may assume TS as the implementation language and a web app as the deployment target.
- **`packs/`** = stack-specialization within that universe (Next.js PWA, monorepo with Bun/Turbo, future mobile with React Native).
- **A future Rust/Go/Python core** would live in a sibling repo (`void-harness-rust`, etc.), reusing the harness mechanics but not the TS-specific skills.

This is documented in `docs/PHILOSOPHY.md` and `docs/ARCHITECTURE.md` (to be amended in the same commit).

### 0bis.2 — Skill decision matrix REQUIRED before per-skill audit notes

Functional, hexagonal, DDD, testing, refactoring, code-review, async-safety will overlap by default. A matrix is required **before** Section 11 (per-skill content), specifying for each skill:

- **When does it win** (i.e. when is it the primary skill for the task?)
- **When does it lose** (i.e. another skill takes precedence — which one and why?)
- **What is it NOT allowed to decide** (boundaries it must defer to others)

Delivered in `plans/skill-decision-matrix.md` (created with this commit, populated incrementally in Section 11).

### 0bis.3 — tdd-guard legitimate bypasses

A blanket "no production code without failing test" rule produces constant false positives. The skill `tdd` and the hook `tdd-guard` must declare explicit bypasses, NOT as escape hatches but as **bona fide cases where TDD does not apply**.

Bypasses (initial list, to be refined in Section 12):

| Case | Justification |
|---|---|
| **Pure refactor** | No behavior change. Tests already cover. Hook checks: `git diff` semantically equivalent (Move/Extract/Rename). |
| **Code deletion** | No new behavior. Hook checks: only deletions, no additions. |
| **Config & build files** | `package.json`, `tsconfig.json`, `vitest.config.ts`, etc. Hook checks: file path matches config glob. |
| **Test fixtures & seed data** | Tests *of* tests. Hook checks: file path matches `tests/fixtures/**`. |
| **DB migrations** | Tested via `migrations-safety` skill + integration tests, not unit TDD. Hook checks: path matches `migrations/**`. |
| **Spikes** | Marked `// tdd-mode: exploratory` or path matches `**/scripts/spike-*`. |
| **Codemods** | Verified by snapshot tests on the codebase, not classical TDD. Hook checks: path matches `**/codemods/**`. |
| **Type-only changes** | `.d.ts` files, `type` exports. Hook checks: AST diff = types only. |
| **Doc-only changes** | `*.md`, `docs/**`. Hook checks: path. |
| **Generated code** | Files with `// @generated` header or under `**/__generated__/**`. |

When in doubt, the hook **warns** instead of **blocks**, and asks the user to confirm. Blocking is reserved for clear violations (new function in `src/` without corresponding `.test.ts` change in the same commit).

### 0bis.4 — Compound-engineering: proposed-learnings queue, NOT auto-write

> **Superseded 2026-07-09** (issue #74): the `learnings/proposed/` queue and the
> `voidcorp:learnings-promote` skill below were never built — a markdown queue is a
> strictly worse reimplementation of tools that exist. The load-bearing principle
> (never auto-write doctrine) stands; the mechanism is now `harness:compounding` +
> `harness:capture-rule` (project rule → `.void/PROJECT-DOCTRINE.md`) + direct GitHub
> issues for universal gaps. See `docs/PHILOSOPHY.md` and `docs/HARNESS_EVOLUTION.md`.

Auto-appending to project CLAUDE.md creates drift, noise, contradictions, and prompt bloat. Replaced with:

- **Capture**: at session-end, the harness writes 0–N learnings to `learnings/proposed/YYYY-MM-DD-N.md` in the project repo. Format: trigger, observation, proposed rule, confidence level.
- **Review**: explicit step — either manual user review, or a dedicated `voidcorp:learnings-promote` skill that consolidates proposals and asks the user "promote this to CLAUDE.md? to docs/? to a skill? discard?"
- **Promotion**: only via a normal commit/PR with diff. Never written automatically to load-bearing doctrine.

Doctrine evolves deliberately, not by accretion.

### 0bis.5 — No verbatim vendoring of superpowers (or anything)

Licensing-wise superpowers is MIT and verbatim copy with attribution is legal. But the maintenance argument stands: vendored verbatim = frozen bugs + fork burden.

Replaced with: **distillation + explicit adaptation per skill**. For each candidate (brainstorming, writing-plans, systematic-debugging, verification-before-completion):

- Read the source
- Extract the load-bearing principles (the "why it works")
- Rewrite for void-harness, removing what doesn't fit, adding what's missing
- Cite the source in the SKILL.md prologue + in the audit note

Skills that are 95% the same as the source remain valuable as "voidcorp's curated version" — but they are deliberately authored, not pasted.

### 0bis.6 — Execution phasing (within v1.0)

The project lead has rejected a reduced MVP scope (we ship v1.0 with all 20 skills, 8 hooks, 3 agents, 2 packs). To avoid a chaotic big-bang, internal execution is phased:

| Phase | Content | Validation |
|---|---|---|
| **Phase A** | CLI scaffolding (`install`, `init`, `doctor`), `voidcorp.config.json` contract, repo CI baseline | CLI installs harness skeleton in a fresh project, doctor passes |
| **Phase B** | Code-discipline foundation: skills `tdd`, `typescript-strict`, `testing`, `refactoring`, `code-review` + hooks `tdd-guard`, `tigerstyle-check`, `pre-commit typecheck+test` | These 5 skills + 3 hooks tested in the harness's own `test/` + dogfooded on a small VoidCorp repo |
| **Phase C** | Architecture skills: `hexagonal-architecture`, `domain-driven-design`, `functional` + skill-decision matrix exercised end-to-end | Boundary conflicts surfaced; matrix refined |
| **Phase D** | Hedge skills: `observability`, `migrations-safety`, `async-safety`, `accessibility-first`, `llm-cost-discipline`, `frontend-design`, `security-guidance`, `commit-discipline` + remaining hooks + 3 agents + compound-learnings queue | Full integration on `voidcorp`, `declik`, `solaar` |
| **Phase E** | Packs `pack-nextjs-pwa`, `pack-monorepo` + npm release v1.0 | Public install works on a fresh Next.js project |

Phases are internal milestones, not version bumps. v1.0 ships when Phase E is green.

### 0bis.7 — Rejected hedge: kill criteria / 2-week trial

Explicit project-lead decision: no metric-based kill criteria, no 2-week observation period. The harness is the foundation, it must be done right and shipped. If the framing turns out wrong at a structural level, we redesign — but we do not gate on adoption telemetry.

(Recorded for traceability. The risk is acknowledged: if the harness creates more friction than value, we will only learn from direct usage friction, not from numbers.)

### 0bis.8 — Harness self-evolution (HITL strict)

> **Superseded 2026-07-09** (issue #74): the `.void/harness-feedback/proposed/` queue
> and the `feedback push` CLI step below were dropped — a perceived gap is filed
> **directly** as a GitHub issue on `voidcorp-core/void-harness` (the tracker is the
> triage zone). The `usage.log` source is now `.void/activations.jsonl` (#70), and
> `audit` gained cross-project aggregation + opt-in issue push (#72). The HITL-strict
> principle stands. See `docs/HARNESS_EVOLUTION.md`.

The harness must evolve from real project usage. Two mechanisms, both strictly Human-In-The-Loop:

- **Inbound feedback**: a new `harness-evolution` skill (mode `feedback`) captures any perception (model or user) that something is missing/wrong/worth-a-rule into `.void/harness-feedback/proposed/` in the **consumer project**. The CLI command `npx @voidcorp/harness feedback push` walks each item with the user (promote / discard / defer) and opens an issue or PR on `voidcorp-core/void-harness` for promoted ones.
- **Outbound audit**: same skill, mode `audit`. Triggered by `npx @voidcorp/harness audit`. Reads `~/.void/usage.log` (local instrumentation), scans upstream source deprecations, surfaces conflicts repeatedly fired in the decision matrix. Proposes deprecations / fusions / rewrites as PRs. Never auto-applied.

This brings core skill count from 20 → **21**. Documented in `docs/PHILOSOPHY.md` § "Harness self-evolution" and in the decision matrix.

### 0bis.10 — Codex parity: AGENTS.md mirror of CLAUDE.md (bi-directional sync)

The harness targets **both Claude Code and Codex CLI** as primary runtimes. Codex uses the `AGENTS.md` convention; Claude Code uses `CLAUDE.md`. Both must coexist and stay in lockstep — modifying one without updating the other creates silent runtime drift.

**Design**:

- Both files live at the same level (root of repo for the meta-doc; root of each pack / consumer project for the deployed version).
- Content is identical doctrine. Adapted terminology only: "Claude Code" ↔ "Codex", "Skill tool" ↔ "tools / shell", "skills" mostly unchanged but cross-references adjusted.
- Source of truth: neither. Both files are authored deliberately; sync is enforced mechanically.

**Sync mechanism (Phase A deliverable)**:

- `scripts/sync-agent-docs.sh` — a pre-commit hook that:
  1. Detects which of `CLAUDE.md` / `AGENTS.md` was modified.
  2. Computes a semantic diff between the two (ignoring known terminology substitutions).
  3. If they have diverged beyond the substitution set, **blocks the commit** with a clear message pointing to the diff.
  4. The user manually replicates the change to the sister file; commit proceeds when both reflect the same doctrine.
- A `scripts/diff-agent-docs.sh` helper produces the doctrine diff on demand for inspection.
- No auto-generation. Auto-generating one from the other risks losing intentional adaptations (Codex doesn't use the Skill tool; certain sections rephrase). Manual edit with mechanical gate is the safer trade-off.

**Deployed in consumer projects**:

The CLI command `npx @voidcorp/harness init` installs both `CLAUDE.md` and `AGENTS.md` in the consumer project (composed from active core modules + active packs). The same sync hook is installed in the consumer's `.husky/` or `lefthook.yml`, so consumer projects also enforce parity.

**Documented**:

- This file (Section 0bis.10)
- `docs/ARCHITECTURE.md` § "Agent runtime parity"
- `CLAUDE.md` and `AGENTS.md` headers (cross-reference)

### 0bis.9 — Mobile-first, dual-quality target

Universal rule: every UI is designed mobile-first AND must reach first-class quality on both mobile and desktop simultaneously. Not afterthought-responsive in either direction.

Enforced jointly by `frontend-design` (layout starts at 360–390px, progressive enhancement) and `accessibility-first` (touch targets ≥ 44×44px, keyboard nav parity). Both viewports screenshot-reviewed before any UI ships.

Documented in `docs/PHILOSOPHY.md` § "Mobile-first, dual-quality target" and reflected in `frontend-design` + `accessibility-first` matrix entries.

---

## Decisions captured (validated)

### Section 1 — Topology (VALIDATED)

See `docs/ARCHITECTURE.md`. Single repo `voidcorp-core/void-harness`, three packages (`cli`, `core`, `packs/*`). Private during incubation.

**Co-existence with current setup**:

- `gstack` stays installed globally (`~/.claude/skills/gstack/`). Covers QA, design, browser, ship. The harness does **not** reinvent these.
- `superpowers` will be **uninstalled from global** once the harness vendors its essential skills. Until then, prefer superpowers and document the migration.
- `void-starter` (Next.js template) will reference `@voidcorp/pack-nextjs-pwa` + `@voidcorp/pack-monorepo` in its CLAUDE.md.

### Section 2 — Scope MVP (VALIDATED)

**Complet**: core + 2 packs + bootstrap CLI.

- `core/` — universal craftsman skills, agents, hooks, CLAUDE.md modules
- `packs/pack-nextjs-pwa/` — Next.js 16 / RSC / Supabase / shadcn / PWA offline
- `packs/pack-monorepo/` — Turbo / Bun / ADR / 5+5 service layout
- `cli/` — `install`, `init`, `add`, `update`, `doctor`

### Section 3 — Hard-rule families in core (VALIDATED)

All four selected, plus security-guidance.

- TDD strict (with `tdd-guard` hook from nizos) — Iron Law in strict mode
- TigerStyle hard rules (function ≤ 70 LOC, line ≤ 100 cols, 2+ assertions/fn, naming with units, no abbreviations, explicit types, no variable duplication)
- Quality bar Folpe (no half-built features, latest stable, no hand-rolled a11y / Radix-wrapping, schema-first at boundaries, no `console.log`)
- Process discipline (senior-reviewer + security-reviewer before commit, brainstorming before creative work, root-cause before fix, ADR for non-obvious decisions, commit messages with "why")
- Security guidance (vendor citypaul + gstack `/cso` lite)

### Section 4 — Distribution (VALIDATED)

CLI npm: `npx @voidcorp/harness install`. Versioned via changesets.

### Section 5 — On superpowers vs custom (VALIDATED)

- Uninstall `superpowers` from global once vendored skills are ready
- Vendor **the essential ones** under `voidcorp:*` names (brainstorming, writing-plans, systematic-debugging, verification-before-completion, test-driven-development → already covered by DECLIK `tdd` skill, port it)
- **Rule of thumb**: if a competitor skill exists that's better on the same step, prefer it; if none is better, vendor verbatim with `.source` attribution
- Each vendored skill has an audit note in `plans/skill-audits/<name>.md`: need, audited sources, choice, improvements vs sources, what is kept verbatim

### Section 6 — Skills priority list (VALIDATED — comes from prior session)

Code-discipline core (8 skills) — sources already mapped:

| Order | Skill | Modes | Sources |
|---|---|---|---|
| 1 | `tdd` | strict / souple / exploratory | DECLIK port + superpowers + citypaul |
| 2 | `typescript-strict` | none (rules non-negotiable) | citypaul + Hejlsberg + tkdodo |
| 3 | `functional` | none | citypaul + Wlaschin "Domain Modeling Made Functional" + Mark Seemann |
| 4 | `refactoring` | strict / souple | citypaul + Fowler "Refactoring" 2018 + Kent Beck "Tidy First?" 2023 |
| 5 | `testing` | none | citypaul + superpowers + Kent C. Dodds Testing Library + James Shore |
| 6 | `hexagonal-architecture` | none | citypaul + Cockburn (2005) + Pierrain + Graca "Explicit Architecture" |
| 7 | `domain-driven-design` | none | citypaul + Evans (2003) + Vernon (2013) + Wlaschin + Stemmler |
| 8 | `code-review` | strict / souple | citypaul/pr-reviewer + superpowers/requesting-code-review |

Process / workflow core (7 skills, **distilled and adapted** — no verbatim vendoring per Section 0bis.5):

- `brainstorming` — adapted from superpowers
- `writing-plans` — adapted from superpowers
- `systematic-debugging` — superpowers OR gstack `/investigate` (TBD)
- `verification-before-completion` — adapted from superpowers
- `security-guidance` — distilled from citypaul + gstack `/cso` lite
- `commit-discipline` — slim, conventional commits + "always say why"
- `harness-evolution` — two modes: `feedback` (inbound, from consumer projects) and `audit` (outbound, obsolescence detection). HITL strict. See Section 0bis.8.

Hedges (6 skills the user validated for inclusion):

- `observability` (structured logging, trace IDs, error boundaries, Sentry, metrics) — priority high
- `migrations-safety` (DB migrations Drizzle/Supabase) — priority high
- `async-safety` (idempotency, retries, distributed locks, jobs/webhooks) — priority medium
- `accessibility-first` (Radix + WCAG + keyboard nav) — priority medium
- `llm-cost-discipline` (prompt caching, batch API, model selection, token budgets) — priority high (differentiator)
- `frontend-design` — vendored from existing `frontend-design` skill, anti-AI-slop

Total: **21 skills** in the core.

### Section 7 — Hooks (VALIDATED, 8 total)

Edit-time / commit-time / PR-time gates that mechanically enforce skills:

- `tdd-guard` (PreToolUse) — block Edit/Write that adds production code without a failing test (nizos/tdd-guard integration)
- `tigerstyle-check` (PreCommit) — function > 70 LOC, line > 100 cols, `console.log` detected → block
- `no-em-dash-no-emoji` (PreCommit) — Folpe rule
- `pre-edit test-pairing` (PreToolUse) — touching `*.service.ts` without touching `*.service.test.ts` → warning + suggest
- `pre-commit typecheck+test` (PreCommit) — `tsc --noEmit && test:affected`
- `pre-PR adr-check` (PreCommit on protected paths) — changed a boundary without touching DECISIONS.md → block
- `post-edit file-size` (PostToolUse) — warning if file > 300 LOC
- `session-end learnings-capture` (SessionEnd) — compound-engineering loop, append session learnings to project CLAUDE.md

### Section 8 — Agents (VALIDATED, 3 total)

> **Superseded 2026-06-01** (DEV-363 agent audit): collapsed 3 → 1. The three
> agents below overlapped existing capabilities 70-85% (anti-bloat rules 3, 6).
> Shipped instead: a single read-only `doctrine-critic`. See
> `docs/DECISIONS.md` and `plans/2026-06-01-doctrine-critic-agent.md`. The
> original three-agent design is kept below as a historical record.

- `senior-reviewer` — pre-commit critical review, scope strictly code quality (not QA / design / ship — those stay in gstack)
- `security-reviewer` — security-focused diff review
- `architect-critic` — boundary / dependency / coupling review

### Section 9 — Anti-bloat discipline (VALIDATED)

Seven hard rules, encoded in `docs/CONTRIBUTING.md` (to write) + enforced in CI:

1. ≤ 400 lines per skill
2. One skill = one subject
3. No responsibility overlap > 30% between skills
4. Frontmatter `description` ≤ 200 chars
5. Hooks ≤ 100 lines, no DSL maison
6. Agents have explicit scope, no spillover into gstack territory
7. Skill tests pass in CI

### Section 10 — TDD skill source (VALIDATED)

The DECLIK `tdd` skill (377 lines, top-5%) is **ported verbatim** into `core/claude/skills/tdd/`, with three minimal adaptations:

1. Hardcoded paths (`apps/*/src/**`) → read from `voidcorp.config.json`
2. Hardcoded commands (`bunx vitest`, `bunx playwright`) → read from `voidcorp.config.json` `stack.packageManager` + `stack.testRunner`
3. Pack-specific references (`@repo/core/logger`, Zod contract paths) → moved into `pack-monorepo` modules, removed from core

Companion hook: `tdd-guard` (nizos), wired to materialize the discipline mechanically.

## Sections pending

The brainstorming was paused before these sections were treated:

### Section 11 — Skill-by-skill master table (IN PROGRESS)

Each of the 21 skills declares its primary source, audited alternatives, adaptation strategy, target file size, hard dependencies on other skills, and the audit note path. Full audit notes live in `plans/skill-audits/<skill>.md` (one file per skill). The template is `plans/skill-audits/TEMPLATE.md`.

**Adaptation strategies**

- `port-DECLIK` — the DECLIK version is already top-5%, we lift it with minimal stack-agnostic adaptations
- `distill` — extract load-bearing principles from named sources, rewrite from scratch with attribution
- `compose-gstack` — wrap or compose existing gstack commands (do not reinvent QA / design / ship)
- `original` — no credible source exists, we author from first principles
- `vendor-plugin` — re-publish a third-party plugin as a void-harness skill, with explicit attribution and our matrix integration

**Target file size**

Anti-bloat hard cap is 400 lines per skill. Targets below are budgets; exceeding the target triggers a split.

#### 11.A — Code-discipline skills (8)

| # | Skill | Strategy | Primary source | Audited alternatives | Target LOC | Depends on | Audit note |
|---|---|---|---|---|---|---|---|
| 1 | `tdd` | `port-DECLIK` | DECLIK `.claude/skills/tdd/SKILL.md` (377 LOC, three modes, mutation gate) | superpowers/test-driven-development, citypaul/tdd, nizos/tdd-guard (companion hook) | 400 | `testing`, `refactoring`, `mutation-testing` | `tdd.md` |
| 2 | `typescript-strict` | `distill` | citypaul tsconfig stance + Hejlsberg TypeScript handbook + tkdodo "you might not need TypeScript any" | matt-pocock TS book, type-fest patterns | 300 | none (baseline) | `typescript-strict.md` |
| 3 | `functional` | `distill` | Wlaschin "Domain Modeling Made Functional" + Mark Seemann "Code That Fits in Your Head" | citypaul fp notes, fp-ts patterns | 350 | `typescript-strict` (ADT machinery), `domain-driven-design` (boundaries) | `functional.md` |
| 4 | `refactoring` | `distill` | Kent Beck "Tidy First?" 2023 + Fowler "Refactoring" 2018 | citypaul refactor notes | 400 | `tdd` (R step delegates here), `testing` (must stay green) | `refactoring.md` |
| 5 | `testing` | `distill` | Kent C. Dodds "Common Testing Mistakes" + James Shore "Art of Agile Development" | citypaul testing notes, superpowers test patterns | 400 | `tdd` (cycle), `mutation-testing` (quality signal) | `testing.md` |
| 6 | `hexagonal-architecture` | `distill` | Cockburn "Hexagonal" 2005 + Pierrain & Boucard "DDD with Hexagonal" + Graca "Explicit Architecture" | citypaul hex notes | 350 | `domain-driven-design`, `functional` | `hexagonal-architecture.md` |
| 7 | `domain-driven-design` | `distill` | Evans "DDD" 2003 + Vernon "Implementing DDD" 2013 + Wlaschin | Stemmler practical DDD, citypaul DDD notes | 400 | `hexagonal-architecture`, `functional` | `domain-driven-design.md` |
| 8 | `code-review` | `distill` | citypaul `pr-reviewer` skill + superpowers/requesting-code-review | gstack `/code-review`, `/codex` review mode | 350 | every other skill (composes) | `code-review.md` |

#### 11.B — Process / workflow skills (7)

| # | Skill | Strategy | Primary source | Audited alternatives | Target LOC | Depends on | Audit note |
|---|---|---|---|---|---|---|---|
| 9 | `brainstorming` | `distill` | superpowers/brainstorming (hard gate, one-question, 2-3 approaches, spec-write) | gstack `/office-hours` (upstream, different niche), compound-engineering plan phase | 350 | `writing-plans` (downstream) | `brainstorming.md` |
| 10 | `writing-plans` | `distill` | superpowers/writing-plans | citypaul plan templates, gstack `/autoplan` (different niche: review of existing plan) | 300 | `brainstorming` (upstream), `executing-plans` (downstream — kept in gstack/superpowers) | `writing-plans.md` |
| 11 | `systematic-debugging` | `compose-gstack` + `distill` | gstack `/investigate` (4 phases, root-cause Iron Law) | superpowers/systematic-debugging | 250 | `tdd` (reproduce as failing test), `observability` (visibility first) | `systematic-debugging.md` |
| 12 | `verification-before-completion` | `distill` | superpowers/verification-before-completion | citypaul completion checklists | 200 | every skill (runs after) | `verification-before-completion.md` |
| 13 | `security-guidance` | `compose-gstack` + `distill` | gstack `/cso` lite-mode + citypaul security stance | OWASP cheat sheets, semgrep rule packs | 400 | `hexagonal-architecture` (boundary discipline), `typescript-strict` | `security-guidance.md` |
| 14 | `commit-discipline` | `original` | Conventional Commits spec + Folpe "always say why" rule | citypaul commit guidance | 200 | `verification-before-completion` | `commit-discipline.md` |
| 15 | `harness-evolution` | `original` | new mechanism (inbound feedback + outbound audit) — see Section 0bis.8 | none — no existing precedent | 350 | none (meta-skill, orthogonal) | `harness-evolution.md` |

#### 11.C — Hedge skills (6)

| # | Skill | Strategy | Primary source | Audited alternatives | Target LOC | Depends on | Audit note |
|---|---|---|---|---|---|---|---|
| 16 | `observability` | `distill` | pino docs + OpenTelemetry semantic conventions + Charity Majors "Observability Engineering" | citypaul observability notes (light) | 350 | `security-guidance` (no PII in logs) | `observability.md` |
| 17 | `migrations-safety` | `original` | Drizzle migrations docs + GoCardless "Zero-Downtime Postgres Migrations" + Strong Migrations (Rails) ported to TS | Neon branching docs, Supabase migration patterns | 400 | `tdd` (test the migration), `observability` (log changes) | `migrations-safety.md` |
| 18 | `async-safety` | `distill` | Stripe "Designing robust webhook handlers" + Bryan Cantrill "Idempotency in distributed systems" + outbox pattern | n8n retry semantics, BullMQ patterns | 400 | `observability` (traces), `security-guidance` (replay attacks) | `async-safety.md` |
| 19 | `accessibility-first` | `distill` | WCAG 2.2 AA + Radix UI patterns + Apple HIG touch targets + Folpe mobile-first dual-quality | citypaul a11y notes, frontend-design skill | 300 | `frontend-design` | `accessibility-first.md` |
| 20 | `llm-cost-discipline` | `original` + adapt | Anthropic prompt-caching docs + batch API + model-selection guidance (existing `claude-api` skill) | OpenAI batch docs, model-router patterns | 350 | existing `claude-api` skill | `llm-cost-discipline.md` |
| 21 | `frontend-design` | `vendor-plugin` | Vercel `frontend-design` plugin (already installed as `frontend-design:frontend-design`) — re-publish with our matrix integration + mobile-first dual-quality | citypaul UI patterns | 350 | `accessibility-first` | `frontend-design.md` |

#### 11.D — Boundaries reaffirmed

The decision matrix (`plans/skill-decision-matrix.md`) is the authoritative document for "when does each skill win/lose/cannot decide." The table above is the inventory. Per-skill audit notes flesh out the content.

#### 11.E — What is NOT in the core (intentional exclusions)

- **QA workflows** — stay in gstack (`/qa`, `/qa-only`, `/health`)
- **Design system creation** — stays in gstack (`/design-consultation`, `/design-shotgun`, `/design-html`)
- **Shipping / deploying** — stays in gstack (`/ship`, `/land-and-deploy`, `/canary`)
- **Browser interaction / scraping** — stays in gstack (`/browse`, `/scrape`, `/skillify`)
- **Product strategy reviews** — stay in gstack (`/office-hours`, `/plan-ceo-review`, `/autoplan`)
- **Skill execution chaining** — stays in superpowers (`executing-plans`, `subagent-driven-development`) until a clear void-harness improvement is identified
- **Mutation testing** — stays as standalone skill (already exists as `mutation-testing`); referenced by `tdd` and `testing` but not re-implemented

Anything in this list moving INTO the core requires an ADR in `docs/DECISIONS.md`.

### [PENDING] Section 12 — Hooks detailed design

For each of the 8 hooks: exact trigger, inputs, exit codes, error messages, integration with `voidcorp.config.json`. Sample implementations.

### [PENDING] Section 13 — Agents detailed design

For each of the 3 agents: trigger, system prompt, tool allowance, output format, integration with skills.

### [PENDING] Section 14 — CLAUDE.md modular structure

Index file + modules (`01-philosophy.md`, `02-tdd.md`, etc.) with `@import` mechanics. Inspired by citypaul `MIGRATION.md` + `SPLIT-CLAUDE-MD-PLAN.md`.

### [PENDING] Section 15 — CLI commands

`install`, `init`, `add`, `update`, `doctor`. Args, behaviors, edge cases.

### [PENDING] Section 16 — Packs (pack-nextjs-pwa, pack-monorepo)

What each pack contains, how it extends core, how it composes with other packs.

### [PENDING] Section 17 — CI workflows

GitHub Actions: lint, skill schema validation, skill tests, hook smoke tests, CLI integration tests, changeset gate, anti-bloat audit.

### [PENDING] Section 18 — Migration plan (existing projects)

How `voidcorp` (marketing site), `solaar` (PWA), `declik` (monorepo) adopt the harness without breaking. Backward-compat for DECLIK's existing `.claude/skills/tdd`.

### [PENDING] Section 19 — Release strategy

Phase 0 = v0.1 internal only on `voidcorp` + `declik`. Phase 1 = v1.0 with pack-nextjs-pwa + pack-monorepo. Phase 2 = future packs (mobile-expo, marketing-site, ai-app).

### [PENDING] Section 20 — Open questions

- `systematic-debugging` — superpowers vs gstack `/investigate` arbitrage
- `frontend-design` — vendoring strategy (already a Claude Code marketplace plugin)
- Branch protection rules + release automation
- How to test hooks in CI deterministically
- Skill versioning granularity (per skill vs per package)

## Next session restart point

Resume at **Section 11 — Skill-by-skill content**, starting with the 8 code-discipline skills, then 6 process skills, then 6 hedges.

**Read order before resuming**:

1. This file's **Section 0bis** — critical-review intake (6 hedges integrated + 1 rejected)
2. `plans/skill-decision-matrix.md` — when each skill wins/loses/cannot decide
3. `docs/PHILOSOPHY.md` § "Stack assumption" — TS/web is the baseline, not agnosticism
4. `docs/ARCHITECTURE.md` § "Boundary principles" — what `core/` may/may not assume

Per-skill format for Section 11: short row in the master table (source retained, verbatim vs adapted, expected size), then full audit note in `plans/skill-audits/<skill-name>.md`. Refine the decision matrix as each skill is fleshed out — any ambiguity surfaced triggers an ADR in `docs/DECISIONS.md`.
