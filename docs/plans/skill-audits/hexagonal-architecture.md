---
skill: hexagonal-architecture
status: reviewed
strategy: distill
target_loc: 350
phase: C
depends_on: [domain-driven-design, functional]
composes_with: [tdd, testing, security-guidance, typescript-strict, refactoring]
matrix_row: plans/skill-decision-matrix.md#hexagonal-architecture
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `hexagonal-architecture`

## Need

Without an enforced boundary discipline, business logic mixes with I/O: services reach into the ORM, controllers call external APIs directly, components query the DB through a "convenient" helper. The codebase becomes impossible to test in isolation (must mock the world) and impossible to evolve (swapping the DB is a rewrite). `hexagonal-architecture` codifies ports (interfaces owned by the domain) and adapters (implementations at the edge), making the domain testable in isolation and replaceable infrastructure cheap.

## Decision matrix anchor

- **Wins**: boundary between domain logic and I/O. Port/adapter design. Where to inject vs hardcode. Use-case layer composition. Cross-package dependency direction
- **Loses to**: `domain-driven-design` on what the domain *is* (bounded contexts, aggregates, ubiquitous language). `functional` on data shapes inside the domain
- **Cannot decide**: which framework to use (Next vs Remix vs SvelteKit — `pack-nextjs-pwa` concern). DB schema design (DDD's call on aggregates). Queue technology (`async-safety` + pack concern)
- **Composes with**: `domain-driven-design`, `functional`, `tdd`, `testing` (nullable infrastructure pattern), `typescript-strict` (port types)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Alistair Cockburn "Hexagonal Architecture" 2005 | https://alistair.cockburn.us/hexagonal-architecture/ | foundation | kept (ports + adapters definition, the original) |
| Bruno Boucard & Thomas Pierrain workshops + talks | various (DDD Europe, NCrafts) | reviewed | partially kept (testing strategy at boundary — drive the domain with adapter contracts) |
| Herberto Graca "Explicit Architecture" | https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/ | reviewed | kept (layered hex with use-cases / application layer) |
| Vladimir Khorikov "Functional C# / Architecture" | https://enterprisecraftsmanship.com | reviewed | reference (functional core / imperative shell framing) |
| citypaul/.dotfiles hex notes | citypaul/.dotfiles | reviewed | partially kept (cross-package import enforcement via tsconfig paths) |
| Gary Bernhardt "Functional Core, Imperative Shell" | talk (DCDC 2012) | reviewed | reference (Bernhardt's framing is hex's twin — kept as a mental model) |

## Adaptation strategy

`distill`. Cockburn's load-bearing definition + Graca's clarity on use-case layer + Bernhardt's functional core / imperative shell as the mental model. Reject heavy CQRS / DI containers (per `docs/PHILOSOPHY.md` Wing Chun).

## What we keep (verbatim or near-verbatim)

- **Cockburn's ports + adapters definition**: a port is an interface owned by the domain that describes WHAT the domain needs from the outside ("save this order", "send this email"). An adapter is an implementation at the edge that wires the port to a concrete technology (Postgres adapter, Resend adapter, in-memory test adapter).
- **Dependency direction**: domain → ports ← adapters. The domain depends on its OWN port interfaces. Adapters depend on the port interfaces AND on infrastructure. Infrastructure never depends on the domain.
- **Use-case layer** (Graca's "application layer"): a thin layer above the domain that orchestrates ports for a specific user goal (`CheckoutCart`, `RegisterUser`). Use-cases are pure-by-default (no I/O), side effects via injected ports.
- **Functional Core / Imperative Shell** (Bernhardt): all decisions happen in pure code (the core). All side effects happen in the shell, in the adapters. Tests against the core run fast and deterministic; the shell is integration-tested.
- **In-memory test adapters owned by the domain** (Pierrain): for every port, an in-memory adapter lives in the domain test fixtures. Tests use it directly. No mocking framework needed at the port level. Composes with `testing` skill's nullable infrastructure pattern.

## What we adapt

- **TypeScript port shape — interface with methods returning `Result<T, E>`**: composes with `functional`. Why: errors as values fits port contracts much better than throwing — the caller can pattern-match on success/failure types.
- **Dependency injection via function parameters, not via constructors or DI containers**: the use-case is `async function checkoutCart(deps: { orders: OrdersPort; payment: PaymentPort }, cart: Cart): Promise<Result<...>>`. Composition is explicit at the call site. Why: per `docs/PHILOSOPHY.md`, no DI containers (tsyringe, awilix). Function parameters are the simplest form of injection and the easiest to test.
- **Adapter thinness rule**: an adapter does ONE thing — translate domain types to/from the external API. No business logic. No validation beyond type mapping. Why: business logic in adapters is duplicated and untested at the domain level. We adapt this rule by adding `code-review` flags for "adapter doing too much" smells.
- **Layered hex (not pure)**: we explicitly adopt a layered shape — `domain/`, `application/` (use-cases), `infrastructure/`. Why: Cockburn's original was layout-agnostic; in practice teams need a convention. `pack-monorepo` provides the canonical layout (`services/` containing domain + use-cases, `repositories/` containing adapters, with a TS path enforcement).

## What we reject

- **Dependency injection containers** (tsyringe, awilix, inversify): rejected. Function parameter injection is the same logical pattern with zero runtime cost, zero magic, zero learning curve. Why: per Wing Chun, every dependency earns its place. A DI container does not earn it at solopreneur scale.
- **CQRS as default**: rejected. Command / Query split is a tool, not a layer. Most domains do not need it; the cost (two paths for every operation, eventual consistency thinking) is paid even when not needed. Why: documented in `docs/DECISIONS.md` (to be created from the design spec).
- **Onion / Clean Architecture as a strict alternative naming**: rejected as duplicates of hex. We use hex vocabulary consistently. Why: terminology proliferation costs onboarding.
- **"Anti-corruption layer" as its own layer** (Evans): rejected as a separate layer name. It is just an adapter pattern (translate external models to internal). Why: a separate vocabulary obscures that it is the same mechanism.
- **Mediator pattern** (MediatR style): rejected. Use-cases called directly. Why: another magic dispatch layer that hides the call graph.

## Hard rules surfaced by this skill

- **The domain (`domain/`, `services/business/`) MUST NOT import from `infrastructure/` or `adapters/`**. Enforced by: SKILL.md + `boundary-direction-check` hook (greps cross-layer imports) + tsconfig paths if pack supports.
- **Components (UI) MUST NOT touch the DB**. They call services. Services call repositories (which are adapters). Enforced by: SKILL.md + `code-review` flags + `pack-nextjs-pwa` server-component rules.
- **Ports are TypeScript interfaces owned by the domain**, named by what they DO (`OrdersPort.save`, `PaymentPort.charge`), not by their technology (`PostgresOrders` is an adapter, not a port).
- **Adapters are thin**: translate types, call the external API, return the result mapped to domain types. No business logic. Enforced by: SKILL.md + `code-review` flags.
- **Use-cases are pure-by-default**: they orchestrate ports but contain no I/O themselves. Their tests use in-memory adapters and run fast (< 100ms each typically). Enforced by: SKILL.md + `testing` skill's nullable-infrastructure pattern.
- **No DI containers**. Function-parameter injection only. Enforced by: SKILL.md + `pack-monorepo` lint rule (no import of `tsyringe` / `awilix` / `inversify`).
- **One port = one cohesive capability**. A `PaymentPort` that grew to handle refunds + disputes + billing reports should split. Enforced by: SKILL.md + `code-review` "fat port" smell.

## Modes — none

The discipline applies uniformly. Within a TDD mode (`strict` / `souple` / `exploratory`), the hex boundaries apply (or are explicitly thrown away for spikes). No `souple` mode here — softening any rule is technical debt to log in `docs/DECISIONS.md`.

## Companion hooks

- **`boundary-direction-check`** (pre-commit) — greps cross-layer imports forbidden by the architecture: any file under `domain/` or `services/business/` that imports from `infrastructure/` / `adapters/` / a framework module → block. ≤ 80 LOC.

(Other architecture hygiene runs via tsconfig `paths` restrictions provided by `pack-monorepo`.)

## Composition with other skills

- **With `domain-driven-design`**: DDD decides the bounded contexts and what an aggregate is. This skill decides where the boundaries sit physically (which package, which layer) and how the domain talks to infrastructure (ports + adapters).
- **With `functional`**: ports return `Result<T, E>`. Use-cases are pure functions taking dependencies as parameters. The core/shell split (Bernhardt) is the same boundary as hex's port boundary, viewed through a functional lens.
- **With `tdd`**: hex makes the domain testable in isolation — `tdd`'s RED step writes a test using in-memory adapters; the production code follows the cycle.
- **With `testing`**: nullable infrastructure pattern (Shore) IS the in-memory-adapter pattern at the port level. Co-evolved.
- **With `security-guidance`**: trust boundaries match adapter boundaries. Zod validation happens at the adapter ingress (translating external untrusted data to typed domain types).
- **With `typescript-strict`**: port interfaces are typed precisely; types travel across boundaries via Zod schemas at adapters.
- **With `refactoring`**: cross-boundary refactors (Move Class from `services/` to `infrastructure/`, or vice versa) — this skill decides the target placement; `refactoring` executes the mechanical move.

## Anti-rules (what this skill MUST NOT do)

- MUST NOT decide which framework. That is a pack concern.
- MUST NOT decide DB schema. `domain-driven-design` picks aggregates; `migrations-safety` handles migration mechanics.
- MUST NOT impose DI containers, CQRS, mediator, event sourcing. All rejected at the architecture level. Re-introducing any of them is an ADR in `docs/DECISIONS.md`.
- MUST NOT silently allow a domain → infrastructure import. The hook blocks; the SKILL.md explains why.
- MUST NOT decide queue technology, cache technology, observability backend — those are pack / hedge skills.

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ≤ 350 LOC
- [ ] Frontmatter `description` ≤ 200 chars, mentions ports + adapters + dependency direction + use-cases + function-parameter injection as headline
- [ ] `.source` file lists Cockburn 2005, Boucard/Pierrain, Graca, Bernhardt, citypaul, Khorikov
- [ ] `boundary-direction-check` hook drafted at ≤ 100 LOC, smoke-tested on a fixture monorepo
- [ ] `pack-monorepo` publishes the layered convention (`services/`, `repositories/`, `domain/`) with tsconfig `paths` enforcing the import direction
- [ ] Matrix row in `plans/skill-decision-matrix.md` matches this audit note
- [ ] Skill tests in `test/hexagonal-architecture/` cover: cross-layer import detection, adapter thinness smell example, use-case purity check
- [ ] No overlap > 30% with `domain-driven-design` (this skill = boundary mechanism; DDD = domain content)
- [ ] No overlap > 30% with `functional` (this skill = where the boundary sits; functional = what shape inside)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor
- [ ] Audit status moved from `reviewed` → `shipped` after first project consumes the skill

## Open questions

- **Use-case layer naming**: `application/`, `use-cases/`, `services/` — the void-starter / DECLIK already uses `services/` for the canonical business layer. Confirm `services/` becomes our standard term (not "application"). Lean confirm; adjust the SKILL.md to use `services/` consistently.
- **Repository vs adapter terminology**: `repositories/` for DB-specific adapters (DDD heritage), `adapters/` for other external services (Resend, Stripe, etc.)? Or one term everywhere? Lean: `repositories/` for persistence, `adapters/` for everything else. Document in `pack-monorepo`.
- **Use-case purity enforcement**: how strict on "use-case is a pure function"? Async-by-nature side effects (awaiting an injected port) are fine. Logging? Lean: logging via injected logger port is fine; logging via global `console.log` is not.
- **Cross-cutting concerns** (transaction, tracing): where do they sit? Lean: cross-cutting concerns live in higher-order use-case wrappers (`withTransaction(useCase)`, `withTrace(useCase)`) that compose at the call site. Document pattern in `pack-monorepo`.
- **In-memory adapter location**: in `tests/in-memory/` (per-package) or co-located in the production package as `adapters/in-memory/`? Lean co-located (the in-memory adapter is part of the port's testable surface, not a test artifact).
- **Function-parameter injection at scale**: a use-case with 5 ports has a 5-field `deps` parameter. Does this become unwieldy? Heuristic: > 5 fields = the use-case is doing too much, split. Add to the SKILL.md as a smell.
