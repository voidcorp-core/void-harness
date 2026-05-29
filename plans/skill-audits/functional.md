---
skill: functional
status: draft
strategy: distill
target_loc: 350
phase: C
depends_on: [typescript-strict]
composes_with: [hexagonal-architecture, domain-driven-design, refactoring]
matrix_row: plans/skill-decision-matrix.md#functional
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `functional`

## Need

Without a functional discipline, an LLM-driven agent writes imperative code by default: mutation everywhere, throw-based error handling, primitives leaking through the domain, side effects mixed with computation. The result: hard-to-test code, race conditions, errors lost in exception flow. `functional` makes purity the default, errors values (`Result<T, E>`), data shapes algebraic (ADTs), and side effects pushed to the boundary.

## Decision matrix anchor

- **Wins**: data flow design, error modeling, pure-by-default decisions, ADT design (sum types)
- **Loses to**: `hexagonal-architecture` on where to put FP (inside the hexagon) vs side effects (at adapters). `typescript-strict` on type expression details
- **Cannot decide**: I/O strategy (defers to hexagonal), persistence shape (defers to DDD), test discipline
- **Composes with**: `typescript-strict` (ADT machinery), `domain-driven-design` (Wlaschin makes them friends)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Wlaschin "Domain Modeling Made Functional" | https://pragprog.com/titles/swdddf | book | foundation (DDD + FP synthesis, error handling, choices as types) |
| Mark Seemann "Code That Fits in Your Head" | https://blog.ploeh.dk/ | reviewed | kept (FP discipline, complexity budget, command-query separation) |
| citypaul fp notes | citypaul/.dotfiles | reviewed | partially kept |
| fp-ts / Effect-TS | https://effect.website | reviewed | referenced for `Result` / `Either` patterns; not vendored as runtime dependency by default |

## Adaptation strategy

`distill`. Wlaschin + Seemann are the load-bearing sources. We do not impose Effect-TS or fp-ts as a runtime dependency.

## Hard rules surfaced by this skill (draft)

- Pure by default. Side effects pushed to the boundary (adapters in hex sense). Pure functions are the body of work.
- Errors are values. `Result<T, E>` (or equivalent: discriminated union with `ok` / `err`) over throwing. Exceptions only for truly unexpected bugs.
- Algebraic data types for choices: discriminated unions over enums + boolean flag bags
- Immutability by default. `readonly` arrays, `const` objects. Mutation only when justified by performance + tested
- Composition over inheritance. Class hierarchies treated as a code smell to be justified
- No null. Use `T | undefined` with explicit narrowing, or `Option<T>` for domain-level optionality

## Companion hooks — TBD
## Modes — none
## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Should `Result<T, E>` be standardized (a `@voidcorp/core` micro-export) or remain BYO per consumer? Lean toward standardized minimal type.
- Effect-TS as opt-in pack? Currently no, but worth a future audit.
