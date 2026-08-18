---
skill: functional
status: reviewed
strategy: distill
target_loc: 350
phase: C
depends_on: [typescript-strict]
composes_with: [hexagonal-architecture, domain-driven-design, refactor, tdd, testing]
matrix_row: plans/skill-decision-matrix.md#functional
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `functional`

## Need

Without a functional discipline, an LLM agent writes imperative code by default: shared mutable state, throw-based error handling for expected failures, primitives leaking through the domain, side effects interleaved with pure computation. The result: hard-to-test code (mutation requires resetting state between tests), race conditions in concurrent paths, expected failures lost in exception flow (catch-and-swallow), and a typesystem that does not reflect the actual data shapes. `functional` makes purity the default, errors values (`Result<T, E>`), state shapes algebraic (discriminated unions), and side effects pushed to adapters at the boundary.

## Decision matrix anchor

- **Wins**: data flow design, error modeling (`Result<T, E>` over throwing), pure-by-default decisions, ADT design (sum types), immutability defaults, functional-core / imperative-shell split
- **Loses to**: `hexagonal-architecture` on where to put the functional core (inside the hexagon) vs side effects (at adapters). `typescript-strict` on type expression details (the type system mechanics)
- **Cannot decide**: I/O strategy (defers to hexagonal). Persistence shape (defers to DDD). Test discipline (defers to `tdd` / `testing`). Whether to adopt Effect-TS / fp-ts as runtime (consumer pack choice)
- **Composes with**: `typescript-strict` (provides ADT machinery + Result type shape), `domain-driven-design` (Wlaschin makes them friends — value objects, always-valid aggregates), `hexagonal-architecture` (functional core = inside; effects = adapters), `refactor` (Replace Loop with Pipeline, Replace Throw with Result)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Scott Wlaschin "Domain Modeling Made Functional" | https://pragprog.com/titles/swdddf | foundation | kept (DDD + FP synthesis, choices as types, Result for railway-oriented programming) |
| Mark Seemann "Code That Fits in Your Head" | https://www.goodreads.com/book/show/57293716 | foundation | kept (FP discipline, complexity budget, command-query separation, "fractal architecture") |
| Gary Bernhardt "Functional Core, Imperative Shell" | DCDC 2012 talk | foundation | kept (mental model + naming) |
| Vlad Khorikov "Functional C#" (translatable to TS) | https://enterprisecraftsmanship.com | reviewed | kept (Result alternative to exceptions, immutability rationale) |
| citypaul/.dotfiles fp notes | citypaul/.dotfiles | reviewed | partially kept (pragmatic FP-in-TS without Effect-TS) |
| fp-ts | https://gcanti.github.io/fp-ts/ | reviewed | referenced as a library, NOT vendored as default. Consumers add explicitly if needed |
| Effect-TS | https://effect.website | reviewed | rejected as default, available as future opt-in pack |
| Robert Martin "Functional Programming for Software Engineers" essays | various | reviewed | reference (purity rationale, no surprising side effects) |
| Eric Normand "Grokking Simplicity" | book | reviewed | reference (stratified design, calculations vs actions) |

## Adaptation strategy

`distill`. Wlaschin + Seemann as the load-bearing sources. Bernhardt as the mental model. We do NOT impose Effect-TS or fp-ts as a runtime dependency — they are excellent for some projects, overkill for most. Functional discipline using only TS primitives + a minimal `Result<T, E>` helper (published in `@voidcorp/core`).

## What we keep (verbatim or near-verbatim)

- **Pure by default** (textbook FP): a function is pure if (a) same input → same output, (b) no observable side effects. Most domain logic should be pure. Side effects (DB writes, network calls, logging, time, randomness) live at the adapter boundary.
- **Functional Core, Imperative Shell** (Bernhardt): all decisions happen in pure code (the "core"). All side effects happen in the shell (adapters). Pure core is exhaustively testable; the shell is integration-tested. This is the SAME boundary as `hexagonal-architecture`'s port boundary, viewed through a different lens.
- **Errors as values** (Wlaschin railway-oriented): expected failures (validation error, out of stock, insufficient balance, not authorized) are `Result<T, E>` values. The function signature tells the caller. The compiler enforces handling.
- **Exceptions for the unexpected** (Khorikov): exceptions remain for truly unexpected bugs (DB down, network timeout, null pointer where invariants said no). Catching them is rare and explicit; otherwise let them crash and observability (Sentry) reports them.
- **Algebraic Data Types** (Wlaschin): a domain choice with N variants is a discriminated union, not a flag bag. `type Order = DraftOrder | SubmittedOrder | ConfirmedOrder | CancelledOrder` — each variant carries the data legitimate for that state.
- **Immutability by default** (textbook): `readonly` arrays, `const` records, mutations explicit. Update-in-place is an exception that earns its place (performance hot path, with tests).
- **Composition over inheritance** (textbook): build behavior by composing functions. Class hierarchies are an exception, not a default. Discriminated unions + pattern matching cover most "OOP polymorphism" use cases.
- **No null**: use `T | undefined` with explicit narrowing for optionality, or `Option<T>` if the consumer adopts the helper. `null` is banned — it duplicates the optionality concept and creates `null | undefined` ambiguity.

## What we adapt

- **`Result<T, E>` shape** standardized as a discriminated union, published in `@voidcorp/core/result`:
  ```typescript
  type Result<T, E> =
    | { ok: true; value: T }
    | { ok: false; error: E };
  ```
  Helpers: `ok(value)`, `err(error)`, `map(result, fn)`, `flatMap(result, fn)`, `unwrap(result, fallback)`. Why: a standard type avoids each project rolling its own incompatible variant.
- **Smart constructors return `Result<Branded, ValidationError>`** (composes with `typescript-strict` branded types + `domain-driven-design` value objects):
  ```typescript
  function createEmail(raw: string): Result<Email, ValidationError> {
    if (!EMAIL_REGEX.test(raw)) return err({ kind: 'invalid_email', raw });
    return ok(raw as Email);
  }
  ```
  Why: validation failure is an expected outcome at the boundary; surfacing it as a `Result` lets the caller decide (display to user, abort flow, retry).
- **Pure function defaults via TS conventions**: a function declared with `function name(input): output` (no `Promise`, no `async`, no external scope read) is presumed pure. Async functions that only `await` injected ports are pure-in-effect (deterministic given the same ports). Async functions that read `Date.now()` or `Math.random()` directly are impure — refactor to inject a `clock` / `random` port.
- **Reject Effect-TS as default** but document the pattern of injected ports for time/randomness/IO. Why: Effect-TS is excellent but a major ergonomic shift; void-harness's defaults must work for projects that have never used FP libraries. Effect-TS can be a future pack.
- **Limited use of FP combinators**: `map`, `filter`, `reduce`, `flatMap`, `pipe` are encouraged. `chain`, `traverse`, `sequenceA`, `applicative` etc. are rejected as default vocabulary (the Haskell-lineage names cost more than they save in a TS context). Consumers who reach for them adopt fp-ts or Effect-TS as a pack.

## What we reject

- **Effect-TS / fp-ts as default runtime dependency**: rejected. Available as opt-in via a future pack. Why: imposing them on every consumer is a major ergonomic shift that not every project wants.
- **Haskell-style point-free style by default**: rejected. Point-free reads beautifully when you know the idiom and obscurely when you do not. Explicit parameters are clearer in a TS context.
- **Monad transformers, Reader/Writer/State as default vocabulary**: rejected. Use plain TS function parameters for dependencies (composes with `hexagonal-architecture` function-parameter injection).
- **`null` for optionality**: rejected. Use `T | undefined` with `exactOptionalPropertyTypes` semantics or `Option<T>` from `@voidcorp/core` if the consumer adopts it.
- **Throwing for expected domain failures**: rejected. Use `Result<T, E>`. Throwing is for the unexpected.
- **Currying as the default function shape**: rejected. Curry when partial application is actually useful at multiple call sites. Otherwise use plain multi-arg functions.
- **Class hierarchies as the default state model**: rejected. Discriminated unions + pattern matching cover ~90% of "polymorphism" use cases more clearly. Class hierarchies are an exception with documented reason.

## Hard rules surfaced by this skill

- **Pure by default**. Side effects pushed to adapters. The domain (per `hexagonal-architecture`) is pure or pure-in-effect (effects only via injected ports). Enforced by: SKILL.md + `code-review` flags on side effects inside domain code.
- **Errors are values for expected failures**: `Result<T, E>` for validation, business rule violations, expected external failures. Throw only for unexpected bugs. Enforced by: SKILL.md + `code-review` flags.
- **`null` banned**: use `T | undefined` or `Option<T>`. Enforced by: SKILL.md + lint rule via `pack-monorepo` (no-null-rule).
- **Discriminated unions for state machines**: a 3-state model is `A | B | C`, not `{ state: 'a' | 'b' | 'c', dataIfA?, dataIfB? }`. Composes with `typescript-strict` exhaustive-switch enforcement.
- **Immutability defaults**: `readonly` arrays, `const` records, `as const` for literals. Mutation is an exception that earns its place. Enforced by: SKILL.md + `code-review`.
- **Smart constructors for value objects** (composes with `domain-driven-design` + `typescript-strict`): return `Result<Branded, ValidationError>`. Never expose the raw constructor.
- **Time / randomness / I/O via injected ports**: pure functions take a `clock`, `random`, or specific port as parameter. Reading `Date.now()` / `Math.random()` / `fetch()` directly inside a "pure" function is a Red Flag.

## Modes — none

Functional discipline applies uniformly within the TS/web baseline. Within a `tdd` mode (strict / souple / exploratory), purity is the default; exploratory may relax it for spikes that are thrown away.

## Companion hooks

- **`no-null-grep`** (pre-commit, configurable) — warn on `null` literal in domain code (`config.paths.business`). False positives expected (JSON parsing, external libs), hence warn. Tag with `// allow-null: <reason>` to suppress. ≤ 40 LOC.

(Most functional rules surface via `code-review` flags and `typescript-strict` enforcement; the discipline is mostly semantic.)

## Composition with other skills

- **With `typescript-strict`**: this skill says WHEN to use sum types / `Result` / branded types; `typescript-strict` provides the type machinery. Co-evolved.
- **With `domain-driven-design`**: value objects = branded types + smart constructors returning `Result`. Aggregates as discriminated-union state machines for stateful workflows. Always-valid domain model.
- **With `hexagonal-architecture`**: functional core = pure domain inside the hexagon. Imperative shell = adapters at the boundary. The boundary is the same; the lens differs.
- **With `tdd`**: pure functions are trivially testable (no setup, no teardown). The RED step writes a property-style or example-based test; GREEN implements the pure function.
- **With `testing`**: pure functions need no mocks. Tests against pure code are sociable by default.
- **With `refactor`**: "Replace Loop with Pipeline", "Replace Conditional with Polymorphism" (via discriminated union dispatch), "Replace Throw with Result", "Extract Pure Function" are common moves.
- **With `security-guidance`**: pure validation functions at trust boundaries returning `Result<Validated, ValidationError>` compose naturally.

## Anti-rules (what this skill MUST NOT do)

- MUST NOT impose Effect-TS / fp-ts / monad transformers / point-free style as defaults.
- MUST NOT decide where the functional / imperative split sits — that is `hexagonal-architecture`'s boundary decision.
- MUST NOT decide what an aggregate is or which entities exist — that is `domain-driven-design`'s call.
- MUST NOT decide test ergonomics inside a framework — that is `testing`'s call.
- MUST NOT silently allow side effects in supposedly-pure functions. The Red Flag triggers a refactor.
- MUST NOT decide naming of pure helpers (the `typescript-strict` naming rules apply).

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ≤ 350 LOC
- [ ] Frontmatter `description` ≤ 200 chars, mentions pure-by-default + Result over throw + ADTs + functional-core/imperative-shell as headline
- [ ] `.source` file lists Wlaschin, Seemann, Bernhardt, Khorikov, citypaul, fp-ts/Effect-TS as referenced
- [ ] `@voidcorp/core/result` published with the standardized `Result<T, E>` shape + helpers (ok, err, map, flatMap, unwrap)
- [ ] `no-null-grep` hook drafted at ≤ 100 LOC
- [ ] Matrix row in `plans/skill-decision-matrix.md` matches this audit note
- [ ] Skill tests in `test/functional/` cover: null detection in domain code, side-effect-in-pure-fn detection example, Result vs throw pattern recognition
- [ ] No overlap > 30% with `typescript-strict` (this skill = when; typescript-strict = how the types express it)
- [ ] No overlap > 30% with `domain-driven-design` (this skill = data shape inside; DDD = bounded contexts and aggregates)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor
- [ ] Audit status moved from `reviewed` → `shipped` after first project consumes the skill

## Open questions

- **`@voidcorp/core/result` helper surface**: minimal (ok, err, map, flatMap, unwrap) vs rich (asyncMap, traverse, combine). Lean minimal — richer combinators can come later or via Effect-TS / fp-ts opt-in.
- **`Option<T>` type — bundle in `@voidcorp/core`?**: lean yes, as a small primitive `{ kind: 'some'; value: T } | { kind: 'none' }`. Document the trade-off vs `T | undefined`.
- **Pipe operator**: TS proposal still stage 2. Use lodash `_.flow` or fp-ts `pipe` or hand-roll? Lean: small `pipe(value, f, g, h)` helper in `@voidcorp/core`, ≤ 20 LOC, type-safe up to ~10 stages.
- **Currying conventions**: when to curry vs plain. Heuristic — curry when the same partial application is used at multiple call sites. Document in SKILL.md.
- **Inheritance escape hatch**: when IS a class hierarchy justified? Lean: framework integration that requires it (React error boundaries, Effect-TS Layer construction). Document examples.
- **Side-effect detection — static or dynamic?**: lean static (lint rule that flags `Date.now()`, `Math.random()`, `fetch()`, `console.*` inside files under `config.paths.business`). Defer mechanics to Phase D refinement.
- **Effect-TS pack opt-in**: when worth introducing? Heuristic — when multiple use-cases need shared cross-cutting concerns (retry, timeout, tracing) that benefit from Effect's structured concurrency. Document trigger.
