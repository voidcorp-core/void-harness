---
skill: domain-driven-design
status: draft
strategy: distill
target_loc: 400
phase: C
depends_on: [hexagonal-architecture, functional]
composes_with: [tdd, typescript-strict, security-guidance]
matrix_row: plans/skill-decision-matrix.md#domain-driven-design
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `domain-driven-design`

## Need

Without DDD discipline, the domain leaks: data models drive the design, business invariants live in services or controllers, ubiquitous language drifts between code and stakeholders. `domain-driven-design` codifies bounded contexts, aggregates as consistency boundaries, value objects for domain primitives, and the ubiquitous language as the source of truth.

## Decision matrix anchor

- **Wins**: identifying bounded contexts, aggregates, ubiquitous language. Anti-corruption layers between domains
- **Loses to**: `hexagonal-architecture` on technical boundary mechanism. `functional` on data shapes within an aggregate
- **Cannot decide**: tactical patterns (delegated to `functional` + `hexagonal-architecture`). Sub-domain analysis (defers to `office-hours` / `plan-ceo-review` upstream)
- **Composes with**: `hexagonal-architecture`, `functional`

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Eric Evans "Domain-Driven Design" 2003 | book | foundation | kept (strategic DDD vocabulary, bounded contexts, aggregates) |
| Vaughn Vernon "Implementing DDD" 2013 | book | foundation | kept (tactical patterns, aggregate sizing) |
| Scott Wlaschin "Domain Modeling Made Functional" | https://pragprog.com/titles/swdddf | foundation | kept (DDD + FP synthesis, types over docs) |
| Khalil Stemmler practical DDD in TS | https://khalilstemmler.com/articles/categories/domain-driven-design/ | reviewed | kept (TS-flavored tactical examples) |
| citypaul DDD notes | citypaul/.dotfiles | reviewed | partially kept |

## Adaptation strategy

`distill`. Strategic DDD (Evans) + tactical FP-flavored DDD (Wlaschin) + TS pragmatics (Stemmler). Reject the heavy CQRS / event-sourcing tactical patterns by default (per PHILOSOPHY Wing Chun); they remain a future pack if a project needs them.

## Hard rules (draft)

- Identify bounded contexts BEFORE writing types. Each context has its own ubiquitous language. Names that look identical across contexts (Order, Customer) are NOT the same type
- Aggregates enforce invariants. Mutations go through aggregate methods, not via direct property assignment
- Value objects for domain primitives: `UserId` (branded string), `Email` (validated), `Money` (amount + currency, no raw `number`)
- Anti-corruption layer at every integration: translate external models to internal at the boundary, never let an external model leak into the domain
- Ubiquitous language wins. If the code names diverge from how the team talks, the code is wrong
- No service classes named `*Manager`, `*Helper`, `*Util` (Evans' anemic anti-patterns)

## Modes — none

## Companion hooks — TBD

## Composition — TBD

## Anti-rules

- MUST NOT prescribe CQRS / event sourcing by default
- MUST NOT decide tactical implementation (FP / OOP shape inside an aggregate) — defers to `functional`
- MUST NOT decide whether a sub-domain is a Core / Supporting / Generic domain — that's a product call

## Verification checklist — TBD

## Open questions

- DDD lite vs full: where do we draw the line for a 2-developer team? Lean lite (Wlaschin) by default, full DDD as a future pack if a domain warrants it.
- Aggregate root identification: heuristic-based skill prompt vs documented per-bounded-context. Lean prompt + per-context note in `docs/DOMAIN.md` of consumer.
