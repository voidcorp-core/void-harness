# Philosophy

## Stack assumption

The harness assumes **TypeScript + web** as its baseline. The `core/` is *not* truly stack-agnostic: it imposes TS strict, Zod at boundaries, a React/Next mental model for UI concerns, `tsc`-style type checking, and TigerStyle naming adapted for typed languages.

Pretending universal agnosticism would dilute the design. A future Rust/Go/Python flavor of the harness would live in a sibling repo (`void-harness-rust`, etc.), reusing the *mechanics* but not the TS-specific skills.

`packs/` specialize *within* the TypeScript/web universe (Next.js PWA, monorepo with Bun/Turbo, future mobile React Native, etc.).

## Three pillars

Three non-negotiables, in order. **Safety > Performance > Developer Experience.**

When two of these collide, the earlier wins. When all three agree, you have an opportunity to find the "super idea" — the simple, elegant move that advances all three simultaneously.

## 1. Safety

Code is steel: cheap to change while hot, expensive once it ships. A problem solved in design is 100× cheaper than the same problem solved in production. The harness invests in design discipline upfront so the implementation is dwarfed by the upfront thought.

**Operational rules**

- Every line of production code is requested by a failing test (Iron Law, in strict mode).
- Every assertion is paired. Validate at write, validate at read. Boundary checks are doubled.
- Every external input is schema-validated at the trust boundary (Zod).
- Functions ≤ 70 lines, lines ≤ 100 cols (TigerStyle limits, physical screen constraint).
- All loops bounded, all queues bounded, all timeouts explicit. Limit everything.
- Use explicitly-sized types. No `usize`. In TypeScript: no `any`, no unmotivated `unknown`.
- All errors handled. The majority of catastrophic production failures come from mishandled non-fatal errors.

Sources: TigerStyle (TigerBeetle), NASA Power of Ten, citypaul `tdd-strict-mode`.

## 2. Performance

Sketches before code. The best time to win 1000× is in design, when nothing exists to profile. Once code exists, you fight diminishing returns.

**Operational rules**

- Back-of-the-envelope sketches across the four resources (network, disk, memory, CPU) and the two characteristics (bandwidth, latency) before non-trivial designs.
- Optimize the slowest resource first, after compensating for frequency of use.
- Batch over react. The program runs at its own pace.
- Be predictable. CPU as a sprinter — no zig-zagging through dispatch tables and dynamic dispatch.
- Distinguish control plane from data plane. Assertions in the control plane stay free.

Sources: TigerStyle, Armin Ronacher "Agentic Coding", citypaul performance notes.

## 3. Developer Experience

Naming, file layout, and feedback loops are not cosmetics — they are how a system scales beyond its author.

**Operational rules**

- Get nouns and verbs right. Long-form, snake_case, units as suffixes (`latency_ms_max`, not `max_latency_ms`).
- Same-length related names line up in source for visual symmetry (`source` and `target`, not `src` and `dest`).
- "Always say why." Commit messages, comments, ADRs — explain the rationale, not the change.
- Comments are sentences, with punctuation. Not scribblings.
- Order matters for readability: important things at the top of a file. Main first. Fields, then types, then methods.
- No em dashes, no emojis in code, docs, or commits.

Sources: TigerStyle naming, citypaul CLAUDE.md, Folpe quality bar.

## Wing Chun / economy of means

Maximum efficiency, minimum motion. Every dependency, every layer, every file earns its place. The harness forbids:

- Dependency injection containers (tsyringe, awilix) — earn nothing at solopreneur scale, cost hours of onboarding
- Explicit CQRS buses — same logic, smaller cost via simple service composition
- Micro-packages (`@repo/utils`, `@repo/hooks`, `@repo/types`) — kitchen-sink collections of unrelated functions
- Runtime feature flag services — env vars and build-time activation suffice
- Hand-rolled accessibility — wrap Radix, do not re-derive ARIA

If a credible alternative exists, it is logged in `docs/DECISIONS.md` with the reason it was rejected.

## "Ultra moderne, exceptionnel" — the Folpe quality bar

- Latest stable libs. React 19, Next 16, TS 6, Tailwind 4. Migration cost accepted.
- No half-built features. Tests, types, error states, loading states, dark mode — all ship together or it does not ship.
- No "fonctionnel-but-not-exceptionnel." Visual polish, motion, copy, DX are part of the deliverable.

A change technically correct but below this bar is pushed back.

## Compound engineering — via a proposed-learnings queue, NOT auto-write

Each session can produce 0–N learnings. These are captured in `learnings/proposed/YYYY-MM-DD-N.md` of the project repo — **never written automatically to CLAUDE.md or any load-bearing doctrine file**.

Promotion to project CLAUDE.md, `docs/*`, or a skill happens only via:

- Explicit user review (manual edit), or
- The dedicated `voidcorp:learnings-promote` skill that consolidates the queue and asks "promote / discard / file as ADR?" for each.

Auto-append into CLAUDE.md was rejected: it creates drift, contradictions, prompt bloat. Doctrine evolves deliberately, not by accretion.

Source: Kieran Klaassen (EveryInc/compound-engineering-plugin), Boris Cherny ("how Boris uses Claude Code"). Adapted — not vendored — to add the review gate.

## What this philosophy excludes

The harness does **not** govern:

- Product strategy or roadmap decisions (use `office-hours` / `plan-ceo-review`)
- Visual design system choices (use `design-consultation`)
- Live QA of running apps (use `gstack:/qa`)
- Ship/deploy mechanics (use `gstack:/ship`, `/land-and-deploy`)

These live elsewhere on purpose. The harness focuses on **how code is conceived, written, tested, and reviewed**.
