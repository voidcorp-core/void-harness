---
skill: refactor
status: reviewed
strategy: distill
target_loc: 400
phase: B
depends_on: [tdd, testing]
composes_with: [code-review, hexagonal-architecture, domain-driven-design, typescript-strict]
matrix_row: plans/skill-decision-matrix.md#refactor
audit_date: 2026-05-29
auditor: Folpe + Claude Opus 4.7
---

# Skill audit: `refactor`

## Need

Without an enforced refactor discipline, refactor slides into rewriting (behavior changes silently mixed in), or never happens at all (debt compounds and the codebase ossifies). An LLM agent left to "clean this up" will combine renames, structural moves, AND behavior changes in a single commit — making review impossible and rollback dangerous. `refactor` codifies Tidy-First (Beck 2023): Tidyings are separated from behavior changes, tests stay green at every step, named refactors from Fowler's catalog are preferred over ad-hoc restructuring.

## Decision matrix anchor

- **Wins**: any change that improves structure without changing observable behavior. Tidy-First moves. Renames, extracts, inlines, reorderings, type extractions
- **Loses to**: `tdd` if ANY behavior changes (refactor stops at the boundary of behavior change). `migrations` for DB schema changes (different discipline)
- **Cannot decide**: whether a refactor is worth the cost (taste call, escalates to user). New design (defers to `hexagonal-architecture`, `domain-driven-design`)
- **Composes with**: `tdd` (R step delegates here), `testing` (must stay green), `code-review` (surfaces refactor candidates)

## Sources audited

| Source | URL | Status | Verdict |
|---|---|---|---|
| Kent Beck "Tidy First?" 2023 | https://www.oreilly.com/library/view/tidy-first/9781098151232/ | foundation | kept — separate Tidyings from Behavior Changes, commit independently, name the move |
| Martin Fowler "Refactoring" 2nd ed. 2018 | https://martinfowler.com/books/refactor.html | foundation | kept — catalog of named refactors with mechanics + smells catalog |
| Michael Feathers "Working Effectively with Legacy Code" 2004 | book | reviewed | kept (Sprout Method, Wrap Method for legacy/untested code) |
| citypaul refactor notes | citypaul/.dotfiles | reviewed | partially kept (Tidy-First commit cadence) |
| Joshua Kerievsky "Refactoring to Patterns" | book | reference | reference (pattern-target refactors, used sparingly) |
| Erik Dietrich "How to be a Senior Developer" essays | https://daedtech.com | reviewed | reference (cost/benefit framing of refactor) |

## Adaptation strategy

`distill`. Beck's Tidy-First as the day-to-day discipline + Fowler's catalog as the move vocabulary. Author for void-harness with two modes (strict / souple) mirroring `tdd`. Reject monolithic-rewrite framing entirely.

## What we keep (verbatim or near-verbatim)

- **Tidyings and Behavior Changes are SEPARATE commits** (Beck): never mix in one commit. The commit message starts with the refactor name (`refactor: extract validateEmail helper`) for Tidyings, `feat:` / `fix:` for Behavior Changes.
- **Named refactors only** (Fowler catalog): Extract Function, Inline Function, Rename Variable, Extract Variable, Move Function, Move Field, Replace Conditional with Polymorphism, Replace Magic Number with Symbolic Constant, etc. "Restructure somehow" is rejected — pick a name, follow the mechanics, commit.
- **Tests stay green at every step**: if a refactor breaks tests, it has changed behavior — back out the refactor, recategorize as `tdd` work, restart in the right mode.
- **Sprout Method / Wrap Method for untested legacy code** (Feathers): when you need to change code that has no tests, sprout the new logic into a new tested function (Sprout) or wrap the old function with a tested boundary (Wrap). Then refactor inward.
- **Code smells as triggers** (Fowler): Long Function, Long Parameter List, Divergent Change, Shotgun Surgery, Feature Envy, Data Clumps, Primitive Obsession (composes with `typescript-strict` branded types), Speculative Generality, Comments-as-Apology. Each smell suggests specific refactors.
- **Two-Hat principle** (Beck): you wear the Tidying hat OR the Behavior Change hat, never both at once. Switching hats means committing.

## What we adapt

- **Two modes mirroring `tdd`**: `strict` enforces one-Tidying-per-commit; `souple` allows mechanical batch Tidyings (e.g., 10 renames done with the IDE's Rename refactor) in a single commit if all are the same Fowler move. Why: solopreneur cadence sometimes warrants batching trivial mechanical moves.
- **"Refactor before, refactor after" rule of thumb** (paraphrased Beck): refactor BEFORE adding a feature if the feature would be hard to add into current shape. Refactor AFTER if implementation surfaced a structural insight. Reject "refactor because the code is ugly" without a triggering task.
- **Commit message vocabulary**: enforce the Fowler refactor name in `refactor:` commits. Adapted by adding a hook (`refactor-named-grep`) that warns on `refactor:` commits without a recognized refactor name. Why: vague refactor messages destroy the value of `git log --grep refactor:`.
- **AST-based refactor preference** (when tooling allows): rename via TypeScript Language Server / VSCode's Rename Symbol over hand-edit + find-replace. Extract Function via the IDE's Extract refactor. Why: AST-based moves are mechanically correct; hand-edits introduce typos.

## What we reject

- **Big-bang rewrites**: rejected. "Let's rewrite this module" is not a refactor — it's a feature project. Goes through `brainstorm` + `plan` + `tdd`. Why: rewrites lose context, regress invariants, and never quite catch up to the original.
- **"Cleanup" commits that mix Tidyings and Behavior Changes**: rejected. Beck's Two-Hat principle is non-negotiable. Why: a commit that does both is unreviewable and unrevertable.
- **`refactor: misc cleanup`** type messages: rejected. Either name the Fowler refactor, or split. Why: this is the path to `git log` becoming useless.
- **Pattern-target refactor as a default** (Kerievsky): rejected as a daily practice. Reach for it when a specific GoF pattern is the documented destination, not as exploration. Why: patterns are tools, not goals; "refactor toward Strategy" is often over-design.
- **Speculative refactor** for future flexibility: rejected. YAGNI. Refactor when current code resists current task. Why: speculative abstractions cost more than they save in 80%+ of cases.

## Hard rules surfaced by this skill

- **Tidyings and Behavior Changes commit separately**. Enforced by: SKILL.md + `tidying-commit-prefix` hook (warn on `refactor:` mixed with `feat:` / `fix:` markers in body).
- **Every `refactor:` commit names a Fowler refactor**. Allowed names list maintained in the skill. Enforced by: `refactor-named-grep` hook (warn on unrecognized name).
- **Tests stay green at every refactor step**. Enforced by: `pre-commit typecheck+test` hook + SKILL.md guidance.
- **No "cleanup" commits**. Either name the refactor or split into Behavior Changes via `tdd`. Enforced by: SKILL.md + `code-review` flags.
- **Sprout/Wrap for untested legacy code**, never edit-in-place without test coverage first. Enforced by: SKILL.md + `tdd` strict mode kicks in once tests exist.
- **No big-bang rewrites without an approved plan**. A rewrite project goes through `brainstorm` → `plan` first. Enforced by: SKILL.md + `code-review` blocks PRs with > N changed files touching the same module without a linked plan.

## Modes

- **`strict`** — one Tidying = one commit, named after the Fowler refactor. Behavior Changes go through `tdd` in its own strict mode. Auto-selected when: `tdd` is in strict for the target paths. Override via `// refactor-mode: strict`.
- **`souple`** — mechanical batch Tidyings allowed (same Fowler move applied multiple times, e.g., 10 Rename Variable). Behavior Changes still separate. Auto-selected when: target paths are in `tdd` souple mode or in `exploratory` (and the work is purely structural). Override via marker.

`exploratory` mode does NOT apply to refactor — exploratory code is meant to be thrown away, not refactored.

## Companion hooks

- **`tidying-commit-prefix`** (commit-msg) — warn if a commit message starts with `refactor:` BUT the body mentions feature work / bugfix indicators (regex: `\b(feat|fix|implement|add)\b` in body). ≤ 40 LOC.
- **`refactor-named-grep`** (commit-msg) — warn if `refactor:` subject does not contain a known Fowler refactor name (allowed list maintained in `packages/core/claude/hooks/fowler-refactors.txt`). ≤ 30 LOC.
- **`pre-commit typecheck+test`** (already declared in master) — composed here: must pass between every refactor step.

## Composition with other skills

- **With `tdd`**: the R of RED-GREEN-REFACTOR delegates to this skill. `tdd` cycles, `refactor` decides which move + executes mechanically. The mode of `refactor` mirrors the mode of `tdd`.
- **With `testing`**: tests must stay green at every step. `testing` decides what makes a good test; `refactor` must not break the existing ones nor add new ones (new tests = behavior change).
- **With `code-review`**: code-review surfaces refactor candidates ("this function has 4 levels of nesting → Extract Function"). The `refactor` skill decides if the refactor is worth doing now + executes.
- **With `hexagonal-architecture`** / **`domain-driven-design`**: when a refactor crosses architectural boundaries (Move Class across packages), the architecture skill decides the target placement; `refactor` does the mechanical move.
- **With `typescript-strict`**: a "Replace Primitive with Branded Type" refactor (`string` UserId → `UserId` branded) is a Fowler-Primitive-Obsession-driven move. This skill executes it; `typescript-strict` enforces the destination.

## Anti-rules (what this skill MUST NOT do)

- MUST NOT change observable behavior. Any behavior change = stop, switch to `tdd`.
- MUST NOT add new tests (that's a behavior addition or a coverage backfill, both go through `tdd`).
- MUST NOT decide whether the refactor is worth doing (taste / cost call escalates to user).
- MUST NOT batch unrelated refactors in one commit, even if they all match a Fowler name (a single commit = a single refactor type, applied N times mechanically in `souple`).
- MUST NOT silently allow "cleanup" mixed-intent commits.

## Verification checklist for shipping this skill

- [ ] SKILL.md drafted at target ≤ 400 LOC
- [ ] Frontmatter `description` ≤ 200 chars, mentions Tidy-First, named refactors, two modes
- [ ] `.source` file lists Beck "Tidy First?", Fowler "Refactoring" 2nd ed., Feathers, citypaul
- [ ] `packages/core/claude/hooks/fowler-refactors.txt` published with the allowed names list (~50 names)
- [ ] Hooks drafted: `tidying-commit-prefix`, `refactor-named-grep` — each ≤ 100 LOC, smoke-tested
- [ ] Matrix row in `plans/skill-decision-matrix.md` matches this audit note
- [ ] Skill tests in `test/refactor/` cover: mixed-intent commit warning, unnamed refactor warning, name allowlist check, mode auto-detection from `tdd` companion mode
- [ ] No overlap > 30% with `tdd` (this skill = the R step; tdd = the cycle)
- [ ] No overlap > 30% with `code-review` (review surfaces; refactor executes)
- [ ] Sister-doc parity: AGENTS.md flavor matches CLAUDE.md flavor
- [ ] Audit status moved from `reviewed` → `shipped` after first project consumes the skill

## Open questions

- **Fowler refactor names list — coverage vs precision**: include all ~70 from the 2nd edition, or curated subset (~30 most common)? Lean curated. Maintain the remaining as "advanced" with explicit invocation.
- **IDE refactor integration**: detecting that a commit was produced by VSCode Rename Symbol vs hand-edit? Beyond MVP. Defer.
- **Cost / benefit framing skill prompt**: when user says "refactor this," should the skill ASK what triggered the request (current task vs aesthetic) before executing? Lean yes for `strict` mode, no for `souple`.
- **Sprout / Wrap detection**: how to detect that the target code is untested → recommend Sprout? Cross-check with `tdd` mode auto-detection. Defer mechanics to Phase D refinement.
- **Renaming across package boundaries** (monorepo): does the refactor cross package boundaries? Then composes with `hexagonal-architecture` matrix check first. Defer integration to Phase D.
