---
skill: typescript-strict
status: draft
strategy: distill
target_loc: 300
phase: B
depends_on: []
composes_with: [tdd, testing, refactoring, hexagonal-architecture, domain-driven-design, code-review, frontend-design]
matrix_row: plans/skill-decision-matrix.md#typescript-strict
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `typescript-strict`

## Need

Without an enforced TypeScript discipline, an LLM-driven agent will reach for `any`, swallow type errors with `as`, skip exhaustive switches, and leave `unknown` un-narrowed. The type system becomes decorative. `typescript-strict` makes the type system load-bearing: types describe truth, `any` is forbidden, `unknown` requires narrowing, exhaustive switches are mandatory, and the compiler is the first reviewer.

## Decision matrix anchor

- **Wins**: every TypeScript file. Types, signatures, exhaustive switches, `unknown` vs `any`, narrowing patterns
- **Loses to**: `functional` on data-shape choices (immutability, ADTs). `domain-driven-design` on domain modeling
- **Cannot decide**: business logic, test strategy, architecture boundaries
- **Composes with**: every other skill (it is the language baseline)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| citypaul tsconfig + TS stance | citypaul/.dotfiles | reviewed | kept (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes baseline) |
| Anders Hejlsberg TypeScript Handbook | https://www.typescriptlang.org/docs/handbook/ | reference | foundation |
| tkdodo "You might not need TypeScript any" | https://tkdodo.eu/blog/the-power-of-const-assertions | reviewed | kept (const assertions, narrowing patterns) |
| Matt Pocock TS book / patterns | https://www.totaltypescript.com | reviewed | partially kept (branded types, type-level patterns) |
| type-fest | https://github.com/sindresorhus/type-fest | reviewed | referenced (utility types library, not vendored) |

## Adaptation strategy

`distill`. Author from first principles, attribution in prologue.

## What we keep — TBD
## What we adapt — TBD
## What we reject — TBD

## Hard rules surfaced by this skill (draft)

- `tsconfig.json` extends `@voidcorp/pack-monorepo/tsconfig.strict.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`
- `any` forbidden in committed code. `unknown` is the escape valve, must be narrowed before use
- `as` cast forbidden except for narrowing after schema validation (Zod boundary) — and even then, prefer `parse` returning the typed value
- Exhaustive switches enforced via `never`-typed default branch
- Branded types for domain primitives (UserId, Email, Money) — no raw `string` for things with semantics
- No type-only files mixed with runtime code; types co-located with their producers

## Modes — none (rules are non-negotiable)

## Companion hooks

- `tsc-noemit-precommit` (composed with `pre-commit typecheck+test`) — `tsc --noEmit` must pass before commit
- `no-any-grep` (PreCommit) — fail if `\bas any\b` appears in staged diff outside whitelisted boundaries (test fixtures)

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions — TBD
