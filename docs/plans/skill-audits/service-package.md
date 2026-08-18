---
skill: service-package
pack: harness-monorepo
status: shipped
strategy: native
target_loc: 200
phase: F
depends_on: [hexagonal-architecture, domain-driven-design, functional]
composes_with: [hexagonal-architecture, domain-driven-design, functional, tdd, typescript-strict]
audit_date: 2026-06-01
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `harness-monorepo:service-package`

## Need

Creating a new `packages/<name>/` package in a Turborepo + Bun workspace is a recurring task with non-obvious constraints: the 5+5 file layout, port direction (service defines port, adapter lives in app), `@repo/*` boundary rules. Without this skill, new packages get reinvented every time, drift from convention, and silently violate hexagonal direction by importing `@repo/db` directly into a service. Each violation is small; cumulatively they erode the architecture.

## Wins

- Single-shot creation flow with concrete file scaffolds and `package.json` template.
- Forces the port/adapter question upfront ("This package owns X, exposes Y, consumed by Z") before any code.
- Materializes the `boundary-direction-check` hook's expectations.

## Loses to

- App-internal services (in `apps/<app>/src/services/`). Those use `harness:tdd` directly; the package-extraction question doesn't apply.

## Composes with

- `hexagonal-architecture` — same port direction; this skill is the operational form.
- `domain-driven-design` — name the package per aggregate or capability.
- `functional` — `helper.ts` purity is enforced.
- `tdd` (strict) — service.ts and helper.ts; souple acceptable on repository.ts default impl.
- `typescript-strict` — mandatory tsconfig extends.

## Adaptations from sources

This skill is **native** — no external source. It distills the existing `01-monorepo-layout.md` module (which describes the topology) into a step-by-step creation workflow. The module says "this is how packages look"; the skill says "here is exactly what to do to create one".

## Rejected ideas

- **Auto-generation via CLI** (`void-harness scaffold service <name>`): tempting but premature. The skill walks the human (or Claude) through the decisions — which we want, because most premature package extractions should be rejected at step 1 ("can you write the boundary in one line?"). Automation would skip that gate.
- **Bundling `migrations-safety` references**: scoped out — this skill is about creating a package, not about DB schema evolution.

## Open questions

- Should `package.json` template be a separate file (`templates/package.json`) consumers can copy? For now it's inlined in the SKILL.md. Decision deferred until we have 3+ consumer-built packages to compare.
