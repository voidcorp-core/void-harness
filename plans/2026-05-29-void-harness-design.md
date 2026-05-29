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
- Be modular: a core agnostic to stack + pluggable packs per stack (Next.js PWA, monorepo, mobile in future)
- Be enforced mechanically: hooks at PreToolUse / PreCommit / Pre-PR levels, not just recommendations
- Be measured: skill tests in CI, anti-usine-à-gaz hard limits
- Auto-improve: compound-engineering loop captures learnings each session into project CLAUDE.md

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
- Each vendored skill has a fiche in `plans/skill-audits/<name>.md`: need, audited sources, choice, improvements vs sources, what is kept verbatim

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

Process / workflow core (6 skills, mostly vendored verbatim from superpowers):

- `brainstorming` — vendored verbatim from superpowers
- `writing-plans` — vendored verbatim from superpowers
- `systematic-debugging` — superpowers OR gstack `/investigate` (TBD)
- `verification-before-completion` — vendored verbatim from superpowers
- `security-guidance` — distilled from citypaul + gstack `/cso` lite
- `commit-discipline` — slim, conventional commits + "always say why"

Hedges (6 skills the user validated for inclusion):

- `observability` (logging structuré, trace IDs, error boundaries, Sentry, métriques) — priority high
- `migrations-safety` (DB migrations Drizzle/Supabase) — priority high
- `async-safety` (idempotency, retries, distributed locks, jobs/webhooks) — priority medium
- `accessibility-first` (Radix + WCAG + keyboard nav) — priority medium
- `llm-cost-discipline` (prompt caching, batch API, model selection, token budgets) — priority high (differentiator)
- `frontend-design` — vendored from existing `frontend-design` skill, anti-AI-slop

Total: **20 skills** in the core.

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

- `senior-reviewer` — pre-commit critical review, scope strictly code quality (not QA / design / ship — those stay in gstack)
- `security-reviewer` — security-focused diff review
- `architect-critic` — boundary / dependency / coupling review

### Section 9 — Anti-usine-à-gaz discipline (VALIDATED)

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

### [PENDING] Section 11 — Skill-by-skill content

For each of the 20 skills: source retained, what is kept verbatim, what is improved, target file size, dependencies on other skills. To be produced as a tabular spec, then per-skill fiches in `plans/skill-audits/<name>.md`.

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

GitHub Actions: lint, skill schema validation, skill tests, hook smoke tests, CLI integration tests, changeset gate, anti-usine-à-gaz audit.

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

Resume at **Section 11 — Skill-by-skill content**, starting with the 8 code-discipline skills, then 6 process skills, then 6 hedges. Format: tabular spec first (one row per skill), then per-skill fiches.
