---
skill: dependency-direction
pack: void-monorepo
status: shipped
strategy: native
target_loc: 250
audit_date: 2026-06-01
---

# Audit: void-monorepo:dependency-direction

**Need.** `@repo/*` import rules are documented in the `01-monorepo-layout.md` module but stated abstractly. When a hook violation fires, devs need a concrete "how do I fix this?" with examples. This skill ships those examples.

**Wins.** Worked example of "billing wants the user" with the wrong way + the port/adapter fix. Type-only sharing trap (importing `User` type still couples). Explicit "do not import from another app" rule with no exception path.

**Loses to.** Single-app projects (no `@repo/*` boundaries). Greenfield projects without code to refactor yet.

**Composes with.** `void:hexagonal-architecture` (doctrine for ports). `boundary-direction-check` hook from core (mechanical enforcement). `void-monorepo:package-extraction` (most violations come from premature extraction). `void-monorepo:service-package` (5+5 layout owns its types).

**Why not in core.** Core's `hexagonal-architecture` is generic ports/adapters doctrine. This skill is the monorepo-specific concretization, with `@repo/*` naming and worked examples a single-app project doesn't need.
