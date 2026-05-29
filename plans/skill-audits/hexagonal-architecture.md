---
skill: hexagonal-architecture
status: draft
strategy: distill
target_loc: 350
phase: C
depends_on: [domain-driven-design, functional]
composes_with: [tdd, testing, security-guidance]
matrix_row: plans/skill-decision-matrix.md#hexagonal-architecture
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `hexagonal-architecture`

## Need

Without an enforced boundary discipline, business logic mixes with I/O, code becomes hard to test (must mock the world), and swapping infrastructure (DB, HTTP client) becomes a rewrite. `hexagonal-architecture` codifies ports (interfaces owned by the domain) + adapters (implementations at the edge), making the domain testable in isolation.

## Decision matrix anchor

- **Wins**: boundary between domain logic and I/O. Port/adapter design. Where to inject vs hardcode
- **Loses to**: `domain-driven-design` on what the domain *is*. `functional` on data shapes inside the domain
- **Cannot decide**: which framework (Next vs Remix vs SvelteKit — pack concern). DB schema design
- **Composes with**: `domain-driven-design`, `functional`, `tdd`

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Alistair Cockburn "Hexagonal Architecture" 2005 | https://alistair.cockburn.us/hexagonal-architecture/ | foundation | kept (ports + adapters definition) |
| Pierrain & Boucard "DDD + Hexagonal" workshops | various talks + their .NET book | reviewed | partially kept (testing strategy at boundary) |
| Herberto Graca "Explicit Architecture" | https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/ | reviewed | kept (layered hex with use-cases) |
| citypaul hex notes | citypaul/.dotfiles | reviewed | partially kept |

## Adaptation strategy

`distill`. Cockburn's load-bearing definition + Graca's clarity. Not CQRS (rejected per Wing Chun in PHILOSOPHY).

## Hard rules (draft)

- Domain owns its ports (interfaces). Adapters implement them. Dependency direction: domain → ports ← adapters
- Components MUST NOT import infrastructure. Components import services. Services import ports
- Ports are TS interfaces with named methods returning `Result<T, E>` (composes with `functional`)
- Adapters are thin: translate from infrastructure to domain types and back. No business logic in adapters
- Tests against ports use in-memory adapters (test doubles owned by the domain). No mocking the port itself
- Use-case layer (Graca's "application layer") orchestrates ports — pure-by-default, side effects via injected ports

## Modes — none

## Companion hooks

- `boundary-direction-check` (pre-commit) — fail if a `domain/` file imports from `infrastructure/`

## Composition — TBD
## Anti-rules — see matrix
## Verification checklist — TBD
## Open questions

- Use-case layer naming: `application/` vs `use-cases/` vs `services/`. Defer to pack-monorepo convention (already `services/`).
- How strict on injection mechanics? Constructor injection vs function parameter. Lean function parameter (no DI container per PHILOSOPHY).
