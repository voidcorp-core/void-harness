---
name: refactoring
description: Tidy-First. Tidyings commit separately from behavior changes (Two-Hat). Named Fowler refactors only. Tests stay green. Two modes (strict/souple). Use when improving structure without behavior change.
---

# refactoring — voidcorp craftsman edition

Refactoring changes structure, not behavior. The moment behavior changes, you stop refactoring and switch to `tdd`. Tidyings and Behavior Changes never share a commit. Named refactors from the Fowler catalog, executed mechanically. Tests stay green at every step.

**Attribution**: see `.source` in this directory. Primary sources: Kent Beck "Tidy First?" 2023, Martin Fowler "Refactoring" 2nd ed. 2018, Michael Feathers for legacy code.

---

## The Two-Hat principle (Beck)

You wear ONE hat at a time:

- **Tidying hat**: structure changes only. No new behavior. No new tests. Tests stay green.
- **Behavior Change hat**: new feature, bugfix, anything that changes observable outcomes. Goes through `tdd`.

Switching hats means committing. Mixing hats in one commit is rejected.

### Why this matters

A commit that does both is unreviewable (the reviewer cannot tell which line is structural and which is functional) and unrevertable (you cannot back out the structural part without losing the feature). The discipline forces clarity.

---

## Cycle

```
1. Pick a smell (or a Fowler trigger)
2. Pick a named refactor (Fowler catalog)
3. Execute mechanically (IDE refactor when possible)
4. Run tests → green
5. Commit with the refactor name in the message
6. (loop until done)
```

If tests turn red at step 4, you have changed behavior. Back out, recategorize as `tdd` work, restart.

---

## Modes

| Mode | Posture | When |
|---|---|---|
| **strict** | One Tidying = one commit, named after the Fowler refactor | When `tdd` is in strict for the target paths |
| **souple** | Mechanical batch Tidyings allowed (same Fowler move applied N times, e.g., 10 Rename Variable) | When `tdd` is in souple, or target paths are in `exploratory` |

`exploratory` is not a refactoring mode — exploratory code is meant to be thrown away, not refactored.

### Auto-selection

Mirror the `tdd` mode for the target paths. Override via `// refactor-mode: strict` or `// refactor-mode: souple` at the file header.

---

## Named refactors (Fowler catalog)

Use a name from the catalog. Vague "restructure somehow" is rejected.

### Common refactors

| Refactor | When |
|---|---|
| **Extract Function** | A block of code does a sub-task that has a name. Give the name a function. |
| **Inline Function** | A function's body is as clear as its name. Inline it. |
| **Extract Variable** | An expression is hard to understand. Name it with a `const`. |
| **Inline Variable** | A variable's name adds no clarity. Inline. |
| **Rename Variable** / **Rename Function** | Better name. Use IDE Rename Symbol. |
| **Move Function** | The function belongs to another module / class. |
| **Replace Conditional with Polymorphism** | A `switch` on type is repeated. Move dispatch to the types. (Use sparingly; discriminated unions + exhaustive switch is often better in TS than classes.) |
| **Replace Magic Number with Symbolic Constant** | Magic numbers (or magic strings) without context. Name them. |
| **Decompose Conditional** | Complex `if` expression. Extract Variable on each branch's condition + Extract Function on each body. |
| **Replace Primitive with Branded Type** | Composes with `typescript-strict`. `string` UserId → `UserId` branded. |
| **Replace Loop with Pipeline** | Imperative loop accumulating into an array. Use `.map().filter().reduce()`. |
| **Replace Function with Command** | Function with many parameters and state. Object with a `run()` method. |
| **Separate Query from Modifier** | A function that returns AND mutates. Split into `getX()` and `setX()`. |

The allowed-names list is maintained in `../../hooks/fowler-refactors.txt`. The companion hook `refactor-named-grep` warns on `refactor:` commits without a recognized name.

### When to use a named refactor

- **Code smell triggers** a refactor. Smells from Fowler's catalog: Long Function, Long Parameter List, Divergent Change, Shotgun Surgery, Feature Envy, Data Clumps, Primitive Obsession (→ branded types), Speculative Generality, Comments-as-Apology.
- **A new feature** would be hard to add into the current shape → refactor BEFORE adding.
- **A just-implemented feature** surfaced a structural insight → refactor AFTER.

NOT triggers:

- "The code is ugly" without a current task — leave it
- "Anticipating future flexibility" — YAGNI

---

## Tidy-First vs Tidy-After (Beck)

| Pattern | When |
|---|---|
| **Tidy First** | Adding the feature into current shape is hard. Tidy the area first, in separate commits, then add the feature. |
| **Tidy After** | The feature reveals the better structure. Add the feature (via `tdd`), then tidy in separate commits. |

Either is fine. Choose by which path is cheaper.

---

## Sprout / Wrap for legacy / untested code (Feathers)

When the target code has no tests and you need to change it:

- **Sprout Method**: do not modify the legacy code. Sprout the new logic into a new, tested function. Call the new function from the legacy code at a clear point.
- **Wrap Method**: when the legacy function is called many places, wrap it: rename `oldFn` → `oldFnRaw`, write a new `oldFn` that delegates to `oldFnRaw` and adds the new behavior (with tests).

Both let you add tested behavior without refactoring untested code first. Refactor inward once a test seam exists.

---

## Commit cadence

### Strict mode

```
refactor: extract validateEmail helper
refactor: rename userQty to userCount
refactor: move formatCurrency to @repo/format
feat: add invoice discount calculation
```

Each refactor commit names a Fowler move. Each refactor is small enough to review at a glance.

### Souple mode

```
refactor: rename UserDto fields to camelCase (15 occurrences, IDE Rename)
refactor: replace inline magic numbers with TAX_RATE constants (8 sites)
feat: add invoice discount calculation
```

Batch is allowed if the move is the same Fowler refactor applied mechanically. Multiple different refactors do NOT batch — that drifts back to "cleanup."

---

## Banned

### Big-bang rewrites

"Let's rewrite this module" is not a refactor — it is a feature project. Goes through `brainstorming` + `writing-plans` + `tdd`. Rewrites lose context, regress invariants, and never quite catch up to the original.

### `refactor: misc cleanup` commits

Either name the Fowler refactor, or split. This is the path to a `git log` that says nothing.

### Mixed-intent commits

`refactor: extract helper and add validation` mixes hats. Split:

- `refactor: extract validateEmail helper`
- `feat: add stricter email validation`

The companion hook `tidying-commit-prefix` warns on `refactor:` commits whose body indicates behavior-change keywords (`feat`, `fix`, `implement`, `add`).

### Speculative refactoring for future flexibility

YAGNI. Refactor when current code resists current task. Future-proof abstractions cost more than they save in > 80% of cases.

### Pattern-target refactoring as a default

Reach for "Refactor toward Strategy / Visitor / etc." only when the pattern is the documented destination. Daily practice is the Fowler catalog, not the GoF.

---

## Composition with other skills

- **With `tdd`**: the R step of RED-GREEN-REFACTOR delegates here. The refactor mode mirrors the tdd mode.
- **With `testing`**: tests stay green at every step. This skill must not add new tests (adding tests = behavior addition).
- **With `code-review`**: review surfaces refactor candidates ("function has 4 levels of nesting → Extract Function"). This skill decides + executes.
- **With `hexagonal-architecture`** / **`domain-driven-design`**: cross-boundary refactors (Move Class across packages) — the architecture skill decides target placement; this skill executes mechanically.
- **With `typescript-strict`**: "Replace Primitive with Branded Type" is a Fowler-Primitive-Obsession-driven move executed here, validated by typescript-strict.

---

## Companion hooks

- **`tidying-commit-prefix`** (commit-msg) — warn if `refactor:` subject is paired with behavior-change keywords in body
- **`refactor-named-grep`** (commit-msg) — warn if `refactor:` subject does not contain a known Fowler refactor name (allowlist in `fowler-refactors.txt`)

See `../../hooks/`.

---

## Anti-rules

- MUST NOT change observable behavior. Any behavior change → stop, switch to `tdd`.
- MUST NOT add new tests (that is a behavior addition or a coverage backfill, both via `tdd`).
- MUST NOT decide whether the refactor is worth doing (taste / cost call escalates to user).
- MUST NOT batch unrelated refactors in one commit, even in `souple`.
- MUST NOT silently allow "cleanup" mixed-intent commits.

---

## When you are stuck

| Problem | Solution |
|---|---|
| Tests turn red on a refactor | Behavior changed. Back out. Recategorize as `tdd` work. |
| Cannot pick a Fowler name | The change is probably a behavior addition disguised as structural. Re-examine. |
| Code has no tests | Sprout Method or Wrap Method (Feathers) first. Then refactor inward. |
| Refactor crosses package boundary | Compose with `hexagonal-architecture` matrix first. Then execute. |
| Want to "clean up" | Pick a current task that triggers the cleanup, or leave it. |

---

## Final rule

```
Refactor → named Fowler move, tests green at every step, separate commit, no behavior change.
Otherwise → it is not a voidcorp refactoring.
```

Refactoring is mechanical. The risk is in mixing it with feature work, not in the move itself.
