---
name: adr-workflow
description: Capture architecture decisions as ADRs (decisions/0001-NNNN.md) — when to write one, when not, format, lifecycle (proposed → accepted → superseded). Distinct from generic plans.
---

# adr-workflow

Use when making a structural choice that **changes how future code is written** in this codebase and where a future contributor (or future-you) would otherwise ask "why did we do it this way?". ADRs are scoped to the codebase; for cross-org or product strategy, use a different tool (Notion, Linear).

Composes with `harness:writing-plans` (which is plan-the-work-before-coding); ADRs document the **decisions** behind that work, persistent in the repo.

## When to write an ADR

- Choosing a library that pins the project (Drizzle vs Prisma, tRPC vs GraphQL, Zustand vs Jotai)
- Naming or layout convention with codebase-wide impact (5+5 service layout, `(actions)` route group placement)
- Boundary decisions (which package owns X, where the trust boundary lives)
- Performance trade-offs accepted explicitly (RSC vs Client default, caching policy)
- Reversal of a previous ADR (creates a new ADR superseding the old)

## When NOT to write an ADR

- Bugfixes (commit message + linked issue is enough)
- Pure refactors that don't change conventions
- Choices reversible in one PR (component rename, internal helper)
- Personal preferences ("I like tab indent") — not a decision, an opinion
- Things already in `PHILOSOPHY.md` or `PROJECT-DOCTRINE.md`

If you cannot name a credible alternative that was rejected, it is not an ADR. Documenting "we chose React" without saying "rejecting Solid/Vue/Svelte because X" is empty.

## Location and naming

```
<repo>/decisions/
├── 0001-use-drizzle-orm.md
├── 0002-server-actions-in-app-actions.md
├── 0003-rsc-by-default.md
└── 0004-replace-jest-with-vitest.md           (supersedes 0010 in another timeline)
```

Sequential 4-digit prefix. Slug describes the decision, not the alternative ("use-X", not "no-Y").

## Format (terse, ~50 lines)

```md
# ADR-0007: Adopt Server Actions for all UI mutations

- **Status**: accepted
- **Date**: 2026-06-01
- **Deciders**: @folpe, @brice

## Context

What forces are at play? What constraints? What is the current pain?
~5 lines.

## Decision

We will <one sentence>.

## Consequences

Positive:
- ...
- ...

Negative:
- ...

## Alternatives considered

- **tRPC mutations**: rejected because <reason>
- **REST endpoints in api/**: rejected because <reason>
- **GraphQL mutations**: rejected because <reason>

## Reversal cost

How expensive is undoing this? Low / Medium / High. Why.
```

If your ADR is longer than 100 lines, the decision is unclear — refine before merging.

## Lifecycle

- **proposed** — drafted, in PR, not yet merged
- **accepted** — merged, applies to all new code
- **deprecated** — still in effect for existing code, new code should not follow
- **superseded by ADR-NNNN** — replaced; the new ADR links back, the old keeps its number forever (never delete)

Reversal = new ADR. Editing an accepted ADR's "Decision" field is forbidden — write ADR-NNNN+1 that supersedes it.

## Workflow

1. **One-line summary first.** Open a PR with just the ADR file containing the title + Context + Decision (one sentence). If you cannot summarize, the decision isn't ready.
2. **Fill alternatives section.** Force yourself to name 2-3 credible options you rejected. If you can't, you're not making a real choice.
3. **Reversal cost.** Explicit. Future-you needs this to know if revisiting is worth it.
4. **Merge with one reviewer.** ADRs are not consensus documents; they are decisions made by responsible parties. Argument happens in PR comments; resolution is the merge.
5. **Reference from CLAUDE.md if foundational.** Major ADRs (>5 minutes of impact per week) link from CLAUDE.md so Claude reads them every session.

## Composition

- `harness:writing-plans` — plans cover the WORK; ADRs cover the DECISIONS behind the work.
- `harness:commit-discipline` — "why" lines in commits often surface ADR-worthy decisions. If a commit's "why" is one paragraph long, it should be an ADR.
- `harness:harness-evolution` — ADRs about the harness itself live in this repo's `decisions/`, not in consumer projects.
