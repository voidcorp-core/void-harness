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

## Mobile-first, dual-quality target

Every UI — including web apps that are not primarily mobile — is designed **mobile-first** AND must reach **first-class quality on both mobile and desktop simultaneously**. Not "mobile-first then responsive afterthought." Not "desktop-first then squeeze for mobile." Both experiences are deliverables.

Concrete invariants enforced by `frontend-design` + `accessibility-first` skills:

- Layout designed at 360–390px first, then progressively enhanced to wider viewports — never the reverse
- Touch targets ≥ 44×44px (Apple HIG) on every interactive element, regardless of viewport
- Keyboard navigation works on desktop with the same completeness as touch on mobile (focus rings, skip links, escape closes modals)
- Performance budget enforced for both : LCP < 2.5s on slow 4G mobile + on desktop fiber
- No mobile-only nor desktop-only feature without an equivalent on the other surface (or an explicit, documented decision)
- Both viewports are screenshotted in design review (mobile portrait + desktop) before any UI ships

Source: Folpe operating principle. Translated into mechanical checks via `accessibility-first`, `frontend-design`, and `pack-nextjs-pwa` design-review hooks.

## Harness self-evolution — feedback loop and obsolescence audit (HITL strict)

The harness must evolve from real usage in real projects, like citypaul's dotfiles evolves from his daily work. Two complementary mechanisms, both **strict Human-In-The-Loop** (no automatic write into doctrine, ever):

### Inbound — `harness-evolution` skill, mode `feedback`

While coding in any project consuming the harness, when the model (or the user) perceives that something is missing, wrong, or worth a rule:

1. The perception is captured to `.voidcorp/harness-feedback/proposed/YYYY-MM-DD-N.md` in the *current project repo* (not in void-harness). Format: trigger, observation, proposed change to harness, target (core / pack / module), confidence.
2. Periodically (or on demand), `npx @voidcorp/harness feedback push` reads the proposed queue, walks each item with the user (promote / discard / defer), and opens a GitHub issue or PR on `voidcorp-core/void-harness` for the ones the user promotes.
3. The void-harness PR carries the source project context as motivation. Nothing is merged without human review.

### Outbound — `harness-evolution` skill, mode `audit`

A recurring auto-evaluation that questions the harness's current surface:

1. Each skill invocation logs to `~/.voidcorp/usage.log` (local, never shipped).
2. `npx @voidcorp/harness audit` produces a report: skills never invoked in N days, skills whose upstream source has been deprecated/superseded, skills whose decision-matrix cell has fired conflicts repeatedly.
3. The report **proposes** deprecations, fusions, or rewrites. Nothing is auto-applied. Each proposal becomes a PR after human review.

### Why HITL is absolute here

Auto-write into the harness's doctrine — even with good signals — would create silent drift, contradictions, and prompt bloat over time. The harness is the foundation; foundations don't shift without deliberate decision. The cost of a human review per change is the price of keeping the doctrine coherent.

Source: citypaul's manual curation discipline; Boris Cherny's "compounding engineering" (adapted with the review gate); user's explicit project lead direction (2026-05-29).

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
