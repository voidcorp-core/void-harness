---
skill: api-and-interface-design
status: draft
strategy: distill
target_loc: 250
phase: C
depends_on: [typescript-strict, functional]
composes_with: [hexagonal-architecture, domain-driven-design, security-guidance, async-safety]
matrix_row: plans/skill-decision-matrix.md#api-and-interface-design
audit_date: 2026-06-04
auditor: Folpe + Claude Opus 4.8
---

# Skill audit: `api-and-interface-design`

## Need

Without a contract-first discipline, public interfaces are whatever leaked out of the implementation: DB rows returned straight to callers, positional boolean flags nobody can read at the call site, thrown errors invisible in the type, and unversioned changes that silently break every consumer the day a field is renamed. Two sentences of pain: a schema migration takes down a consumer because the ORM row was the API; a "small rename" ships as a patch and pages on-call. This skill makes the contract the deliberate artifact — designed, reviewed, and versioned before the implementation — so the implementation stays free to churn while the promise to consumers stays stable.

## Decision matrix anchor

Quote the relevant cells from `plans/skill-decision-matrix.md#api-and-interface-design` (matrix row to be added in the same matrix-maintenance pass; this note governs until then):

- **Wins**: shape of a public contract (signatures, input/output types, error set, invariants); minimal-surface decisions; misuse-resistance of a signature; boundary-type vs internal-type choice; versioning and backward-compatibility / deprecation policy; idempotency and pagination as contract terms for network APIs.
- **Loses to**: `hexagonal-architecture` on where the boundary sits physically and the dependency direction. `domain-driven-design` on what the domain is and what the words mean. `typescript-strict` on type-expression details. `security-guidance` on the validation mechanism itself.
- **Cannot decide**: layered architecture / ports-vs-adapters placement (`hexagonal-architecture`); bounded contexts, aggregates, ubiquitous language (`domain-driven-design`); transport / framework / serialization library (pack concern); async boundary placement (`async-safety` + `hexagonal-architecture`).
- **Composes with**: `hexagonal-architecture` (draws the port well as seen from outside), `domain-driven-design` (contract names from ubiquitous language), `typescript-strict` (boundary types, unions), `functional` (Result error set), `security-guidance` (input validation at boundary), `async-safety` (idempotency, pagination).

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Parnas "On the Criteria To Be Used in Decomposing Systems into Modules" (1972) | https://www.cs.umd.edu/class/spring2003/cmsc838p/Design/criteria.pdf | read | kept (information hiding: contract is the stable surface, implementation is the hidden, replaceable decision) |
| Joshua Bloch "How to Design a Good API and Why It Matters" | https://www.infoq.com/presentations/effective-api-design/ | read | kept (minimal surface, "when in doubt leave it out", make it hard to misuse, public APIs are forever) |
| Contract-first / API-first with OpenAPI | https://swagger.io/resources/articles/adopting-an-api-first-approach/ | reviewed | kept (write the contract/spec before the implementation; spec is independently reviewable) |
| Semantic Versioning 2.0.0 | https://semver.org/ | read | kept (MAJOR/MINOR/PATCH promise; additive-first; deprecation-before-removal cycle) |
| void-harness `hexagonal-architecture` | packages/core/skills/hexagonal-architecture/SKILL.md | read | kept as boundary reference (ports exist there; this skill shapes them from outside, no overlap on placement) |

## Adaptation strategy

`distill`. Lift the load-bearing principles — information hiding (Parnas), minimal misuse-resistant surface (Bloch), spec-before-code (contract-first/OpenAPI), and the compatibility promise (SemVer) — and rewrite for void-harness so they compose with the existing architecture skills instead of restating them. The contract-first ordering, the Rationalizations table, and the Verification checklist are authored for this skill.

## What we keep (verbatim or near-verbatim)

- **Information hiding** (Parnas): the public interface is the commitment; the design decisions behind it are hidden and free to change. "Contract is the promise, implementation is replaceable" is Parnas in one line.
- **Minimal surface / "when in doubt, leave it out"** (Bloch): adding is non-breaking, removing is breaking; expose the least.
- **Make it hard to misuse** (Bloch): illegal states unrepresentable, named options over positional booleans, branded primitives.
- **Public APIs are forever** (Bloch): every exported symbol is a long-term liability; this drives the versioning and deprecation rules.
- **Spec-before-code** (contract-first / OpenAPI): the contract is a reviewable artifact independent of the implementation.
- **SemVer compatibility promise**: additive = MINOR, breaking = MAJOR; deprecate before removing.

## What we adapt

- **Errors as part of the contract**: changed from Bloch's exception-centric (Java) guidance to typed `Result<T, E>` with stable codes/HTTP statuses. Why: composes with `functional`; thrown errors are invisible in the type and consumers forget to handle them.
- **Boundary types**: changed from "don't expose implementation classes" (generic) to "no ORM/framework/DB type crosses the boundary; map to a DTO/branded type in the adapter." Why: ties the rule to `hexagonal-architecture` (translation lives in the adapter) and `typescript-strict` (branded types).
- **Input validation**: added an explicit "validate at the boundary with a schema (Zod) before use" step not in the classic sources. Why: composes with `security-guidance`; external input is untrusted.
- **Network-API terms**: added idempotency keys and pagination as first-class contract terms. Why: not in Parnas/Bloch (pre-web era for Parnas); essential for wire interfaces and breaking to retrofit. Composes with `async-safety`.
- **SemVer applied to module boundaries, not just packages**: the deprecation cycle applies to any consumed interface, including in-repo module boundaries. Why: in a monorepo, an internal module still has consumers.

## What we reject

- **Verbatim Java/Effective-Java idioms** (builders everywhere, checked exceptions): rejected. We use named options objects + `Result`, which fit TypeScript and `typescript-strict`.
- **Heavy API-governance frameworks / style guides** (full corporate API standards, linter rulesets): rejected for v1. The discipline is principle-level; a pack may add an OpenAPI/contract linter later.
- **Owning input-validation mechanics**: rejected — `security-guidance` owns the Zod/validation specifics; this skill only mandates that validation happens at the boundary.
- **Owning boundary placement / dependency direction**: rejected — that is `hexagonal-architecture`. Kept strictly to contract shape to hold overlap < 30%.
- **Re-defining ports**: rejected — DDD/hex define ports and domain words; this skill only shapes the external contract.

## Hard rules surfaced by this skill

- **The contract is designed and reviewed before the implementation.** Enforced by: SKILL.md guidance + `code-review` structure dimension (implementation-first API flagged).
- **No internal / ORM / framework type crosses a public boundary.** Enforced by: SKILL.md + `code-review` flags + composition with `hexagonal-architecture` (boundary types mapped in adapters).
- **All external input is validated at the boundary before use.** Enforced by: SKILL.md + `security-guidance` + `hexagonal-architecture` (adapter ingress).
- **Failures are a closed, typed `Result` set with stable codes; messages carry no sensitive detail.** Enforced by: SKILL.md + `functional` + `code-review` security dimension.
- **No positional booleans; multi-argument calls use a named options object.** Enforced by: SKILL.md + `code-review` readability dimension.
- **A breaking change requires a new version or a documented deprecation cycle (deprecate → coexist → remove next major).** Enforced by: SKILL.md + `code-review` + changelog discipline.
- **Network APIs: retryable mutations accept an idempotency key; growable collections are paginated.** Enforced by: SKILL.md + composition with `async-safety` + `code-review`.

## Modes — none

The discipline applies uniformly to any public interface. There is no `souple` mode: softening the contract (leaking a type, skipping versioning) is technical debt to log in `docs/DECISIONS.md`, not a relaxed mode.

## Companion hooks

None in v1. The versioning/compatibility discipline is guidance plus a `code-review` surface. A contract-diff hook (detect a removed/renamed exported symbol or a narrowed input type against the previous tag and warn on a missing deprecation marker) is an attractive future hook — captured as an open question, not shipped, to respect the ≤ 100 LOC and "no DSL maison" hook discipline.

## Composition with other skills

- **With `hexagonal-architecture`**: hex decides the port exists, who owns it, and where it sits; this skill decides how the port reads from the outside (minimal, misuse-resistant, versioned). Sequencing: hex places the boundary, then this skill shapes the contract on it. Shared mechanism: boundary types are mapped to internal types in the adapter.
- **With `domain-driven-design`**: DDD supplies the ubiquitous-language names and value objects; this skill reuses them in the contract. No overlap — DDD names, this skill shapes the public face.
- **With `typescript-strict`**: branded types and discriminated unions express the contract; exhaustive handling of the error union is verified by `never`.
- **With `functional`**: `Result<T, E>` is the boundary return; the error set is a closed ADT.
- **With `security-guidance`**: input parsed/validated at the boundary; error payloads carry no sensitive detail.
- **With `async-safety`**: idempotency-key semantics and pagination cursors for wire interfaces.

## Anti-rules (what this skill MUST NOT do)

- MUST NOT decide where the boundary sits physically or the dependency direction — `hexagonal-architecture`.
- MUST NOT define the domain model, bounded contexts, or aggregates — `domain-driven-design`.
- MUST NOT expose internal / ORM / framework types across a public boundary.
- MUST NOT break a published contract without a new version or a documented deprecation cycle.
- MUST NOT design the API after the implementation (implementation-first).
- MUST NOT decide the transport / framework / serialization library — pack concern.
- MUST NOT own the input-validation mechanism — that is `security-guidance`.

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ≤ 250 LOC (≤ 400 hard cap) — currently ~230
- [ ] Frontmatter `description` ≤ 200 chars, precise for auto-discovery (contract-first, public interface kinds, minimal surface, boundary types, versioning)
- [ ] `.source` file lists Parnas, Bloch, contract-first/OpenAPI, SemVer, hexagonal-architecture with URLs
- [ ] `## Rationalizations` table present
- [ ] `## Verification` section present
- [ ] Explicit boundary section vs `hexagonal-architecture` and `domain-driven-design`
- [ ] No overlap > 30% with `hexagonal-architecture` (this skill = contract shape; hex = boundary placement / direction)
- [ ] No overlap > 30% with `domain-driven-design` (this skill = public face; DDD = domain content / vocabulary)
- [ ] Matrix row added in `plans/skill-decision-matrix.md#api-and-interface-design` (shared file — separate maintenance pass)
- [ ] Skill test in `test/api-and-interface-design/` covers at least 2 fixtures (e.g. leaked ORM type, positional boolean, missing deprecation on a rename)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor
- [ ] Audit status moved from `draft` → `reviewed` after user review

## Open questions

- **Contract-diff hook**: worth a `contract-diff-check` hook that diffs exported symbols / input types against the previous git tag and warns on a removal/rename without a `@deprecated` marker? Lean: yes eventually, but it must stay ≤ 100 LOC and language-aware enough to avoid noise; defer to a dedicated hook design.
- **OpenAPI as canonical artifact**: for HTTP packs, should the OpenAPI spec be the source of truth (codegen for types) or a generated reflection of typed handlers? Lean: pack-level decision (`pack-nextjs-pwa` / API pack), not core skill.
- **Matrix row text**: confirm the exact wins/loses cells with the matrix-maintenance pass; this note is the interim governing source.
- **Deprecation window unit**: release-count vs calendar date as the default deprecation window. Lean: release-count for libraries, date for hosted APIs; document in the relevant pack.
