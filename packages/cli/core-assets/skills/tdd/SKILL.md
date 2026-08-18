---
name: tdd
kind: standard
activation: always
description: TDD in three modes (strict/souple/exploratory) chosen by path. Iron Law in strict (no prod code without a failing test), mutation gate if tooled, anti-rustine. Use for any feature, bugfix, refactor.
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: pretooluse
    codex: pretooluse
    hermes: ci-only
eval_targets: [claude/anthropic/opus]
---

# tdd — voidcorp craftsman edition

Curated aggregate of the best TDD practices for the TypeScript/web stack 2026. Ported from the DECLIK `tdd` skill (377 LOC, already top-5%), adapted to be stack-agnostic via `.void/config.json`.

**Attribution**: see `.source` in this directory. Primary sources: DECLIK port (which itself distills superpowers/test-driven-development + citypaul/tdd + nizos/tdd-guard). This skill **does not reinvent**; it composes at the right level for void-harness consumers.

The companion hook `tdd-guard` (see `../../hooks/tdd-guard.sh`) materializes the structural floor of this discipline at the Edit/Write level: a sibling test file MUST exist before production code is edited. It does not run the suite, so the failing-first (RED) step in strict mode stays the engineer's discipline, not something the hook can verify.

---

## Modes

Three postures, chosen by context. If unsure of the mode, ask explicitly before coding.

| Mode | When | Posture |
|---|---|---|
| **strict** | New behavior on production code, hotfix on paying surface, refactor that changes observable behavior, DB integration that affects business invariants | Iron Law (zero line of production code without a failing test that requested it) + mutation testing when the project has a mutation runner + 100% coverage + commit/PR evidence trail |
| **souple** | Integration glue tested at a higher level (E2E + handler covers the chain), framework wiring, config | RED-GREEN-REFACTOR without mutation gate, ≥ 80% coverage on business code, no commit-by-phase ritual |
| **exploratory** | Documented spike, throwaway POC, scripts marked as such, draft work | No TDD obligation. The file MUST declare throwaway status + deletion date in a header comment. If the code survives the spike, it transitions to strict before merging to prod. |

### Auto-detection heuristic

If no explicit `Mode:` marker is in the task or a file header comment, apply:

- Path matches `<config.paths.business>` and not in `<config.paths.spikes>` nor in `docs/` → **strict**
- Path matches `<config.paths.spikes>`, draft folder, or scaffolds → **exploratory**
- Path matches `<config.paths.serverActions>` (boundary HTTP / Server Action) AND the pure logic is in `services/` with strict tests → **souple** on the handler, **strict** on the service
- Otherwise → **souple** + ask confirmation if in doubt

Paths come from `voidcorp.config.json`. Defaults are documented in `packages/core/claude/skills/tdd/defaults.md`.

### Override

The user can impose a mode via:

- Prompt marker: "implement X in strict mode" / "spike in exploratory mode"
- File header comment: `// tdd-mode: strict`
- Repo-wide: `.void/config.json` → `{ "modes": { "tdd": "strict" } }`

---

## Iron Law (strict only)

```
ZERO LINE OF PRODUCTION CODE WITHOUT A FAILING TEST THAT REQUESTED IT.
```

**No exception without explicit permission.** Keep the spirit AND the letter — violating one violates both.

### If you wrote code before the test (strict)

- You **delete** it. Delete means delete.
- Do not keep anything "as reference"
- Do not "adapt" existing code while writing the tests
- Do not look at the deleted code while re-implementing
- Implement fresh from the tests

Sunk-cost fallacy: the time is already lost. Keeping unverified code is technical debt, not an asset.

---

## Cycle

### Strict mode

```
RED → Verify RED → GREEN → Verify GREEN → [MUTATE → KILL MUTANTS] → REFACTOR
```

The bracketed steps run only when the project has a mutation runner (see MUTATE below).

### Souple mode

```
RED → GREEN → REFACTOR (if it has value)
```

### Exploratory mode

```
Code → [does the demo prove the idea?] → either transition to strict before merge, or delete.
```

### RED — write the failing test

One thing tested, a name that states the behavior, real code — assert on the observable
outcome, never on a mock's call count (that tests the mock, not the behavior). Mocks live
only at infrastructure boundaries. The full technique (how to express the test, factories,
mocking policy) is the `testing` skill's job; TDD owns only *when* and *that* it fails first.

Before finalizing the test, scan the mutator rules (boundaries, boolean combinations, equality, arithmetic identities, array/string ops, optional chaining, side effects). This scan needs no tooling and no runner: it is how you write a test that a mutant could not survive, whether or not the project can actually run one.

### Verify RED — watch it fail

**Strict: mandatory. Never skip.**

```bash
<config.commands.testUnit> path/to/file.test.ts
```

Confirm:

- Test fails (not a syntax error)
- The failure message matches what you expect
- Fails because the feature is missing, not because of a typo

### GREEN — minimal code

```typescript
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try { return await fn(); }
    catch (e) { if (i === 2) throw e; }
  }
  throw new Error('unreachable');
}
```

**No more.** No speculative configuration options. No refactor during GREEN.

### Verify GREEN

```bash
<config.commands.testUnit> path/to/file.test.ts
```

Confirm:

- Test passes
- Other tests still pass
- Pristine output (no warnings, no errors)

### MUTATE (strict, only when a mutation runner is present)

The harness ships no mutation runner and installs none. `init` detects Stryker in the project's
dependencies and writes `commands.mutation` into `.void/config.json` only on that signal, so the
presence of that key *is* the capability check.

- Key present → run `<config.commands.mutation> --mutate <path>`, produce a killed/survived/score
  report, and treat the gate as mandatory in strict.
- Key absent → the gate does not apply. Never invent a `stryker` command and never block the cycle
  on it; the mutator scan at RED carries the intent instead. Adopting a runner is a project
  decision, not something this skill performs.

### KILL MUTANTS (strict, when MUTATE ran)

For each survivor:

- If the case value is clear → add a test
- If ambiguous (business judgment) → ask the user via AskUserQuestion before patching

All tests must pass after fix.

### REFACTOR

After GREEN (and after MUTATE/KILL in strict), assess the improvements.

| Priority | Action | Examples |
|---|---|---|
| Critical | Now | Knowledge duplication, > 3 nesting levels, critical surviving mutations |
| High | This session | Magic numbers, unclear names, functions > 30 lines |
| Nice | Later | Minor renames, single-use helpers |
| Skip | Do not touch | Already clean code |

Tests must stay green at every step.

Load the `refactor` skill for the detailed methodology (RED-GREEN-REFACTOR strict commit boundaries).

---

## Stack glue

### Commands (read from `voidcorp.config.json`)

- Unit: `<config.commands.testUnit>` (e.g. `bunx vitest run`, `pnpm vitest`, `npm test`)
- E2E: `<config.commands.testE2e>` (e.g. `bunx playwright test`)
- Mutation: `<config.commands.mutation>` (e.g. `bunx stryker run`) — absent when no mutation runner is detected
- Watch: `<config.commands.testWatch>` (e.g. `bunx vitest --watch`)

### Conventions

- Test files: `Name.test.ts` co-located with the source file
- Real-I/O integration tests: `Name.integration.test.ts`
- E2E Playwright: `<config.paths.e2e>` (e.g. `apps/*/tests/e2e/*.spec.ts`)

See the `testing` skill for the full technique catalog (factories over `beforeEach`, fixture externalization, behavior-first naming, snapshot policy).

### Schema contracts at trust boundaries

If you touch a schema in `<config.paths.contracts>` (Zod schemas at trust boundaries):

1. RED: add a `parse()` case that should fail (invalid data) or succeed (valid data)
2. GREEN: modify the schema
3. Verify: every downstream call site that consumes this type must compile AND pass its tests

The contract is the **single source of truth**, never redefined in tests.

### Frontend behavior (strict)

For a UI change, RED lives at the smallest observable surface: component, hook, store, accessibility
contract, or rendered state. Cover every applicable loading/empty/error/success/partial state named
by the pre-build experience brief. An interactive control needs a role-first keyboard regression
test before any E2E proof; E2E may confirm the journey but cannot be the first place a keyboard bug
is caught. Record passing test evidence against the current diff hash so a later UI edit invalidates
the proof instead of inheriting green.

### Anti-pattern detected too often

Mocking the DB or Server Actions to make a test pass: it breaks at the next refactor without
protecting anything. Prefer integration tests (pglite / dev DB branch) or invoking the action
directly. Full anti-mock-business rationale: the `testing` skill.

---

## Coverage (strict)

100% by default on the business layer (services + domain). Verification before PR approval:

```bash
<config.commands.testUnit> --coverage
```

Target reading:

```
All files | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|---
All files |   100   |   100    |   100   |   100   |
```

### Exception

If 100% is impossible (e.g. a Sentry wrapper whose init branch is not testable without an HTTP cassette):

1. Document in the package README: why + where the missing coverage is compensated (integration/E2E)
2. Explicit Folpe approval
3. List in repo CLAUDE.md under "Test coverage exceptions"

Burden of proof on the requester. 100% remains the default.

---

## TDD Evidence (strict)

The commit history must show the RED → GREEN → [MUTATE → KILL] → REFACTOR progression.

```
abc123  test: add failing test for retryOperation backoff
def456  feat: implement retryOperation exponential backoff
ghi789  test: strengthen boundary tests post-mutation (kills 3 survivors)
jkl012  refactor: extract backoff helper for clarity
```

### Documented exceptions

If evidence is not linear (multi-session, grouped refactor, context resume), document in the PR:

```markdown
## TDD Evidence

RED phase: commit c925187
GREEN phase: commits 5e0055b, 9a246d0
MUTATE + KILL: commit 7b8c9d0
REFACTOR: commit 11dbd1a

Test Evidence:
- 4/4 tests passing (vitest run, 7.7s)
- Mutation score: 94% (3/52 documented survivors)
```

Exception on the evidence presentation, **never on the process**.

---

## Anti-rustine integrated

If you are tempted to:

- Skip TDD "just this once"
- Mock everything to "make the test pass"
- Cast `as any` to avoid real modeling
- Add a test after the fact that passes immediately

→ Stop signal. Redesign the approach. Source: project-level "no rustine" rule.

A test that is hard to write = a design that is hard to use. The test is the API oracle.

---

## Red Flags (strict)

Source: superpowers/test-driven-development. Keep the full list — this is the anti-drift psychology.

- Code written before the test
- Test written after the implementation
- Test that passes immediately
- Cannot explain why the test failed
- Tests added "later"
- Rationalization "just this once"
- "I already tested it manually"
- "Tests after reach the same goal"
- "It is the spirit, not the ritual"
- "Keep as reference" / "adapt the existing code"
- "I already spent X hours, deleting is a waste"
- "TDD is dogmatic, I am pragmatic"
- "This case is different because..."

→ **All these phrases mean: delete, start over in strict.**

---

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Too simple to test" | Simple code breaks. The test takes 30 seconds. |
| "I test afterward" | Tests that pass immediately prove nothing. |
| "Tests after reach the same goal" | After-tests answer "what does this code do." Before-tests answer "what should this code do." |
| "I tested it manually" | Manual ≠ systematic. No trace, not re-executable. |
| "X hours of work to delete = waste" | Sunk-cost fallacy. Keeping unverified code is debt. |
| "Keep as reference, write tests first" | You will adapt it. That is testing-after. Delete = delete. |
| "Need to explore first" | OK. Throw away the exploration, restart in strict. |
| "Hard to test = design not clear" | Listen to the test. Hard to test = hard to use. |
| "TDD will slow me down" | TDD is faster than debugging in prod. Pragmatic = test-first. |
| "Manual is faster" | Manual does not prove edge cases. You will re-test on every change. |

---

## Verification checklist

Before marking the work complete:

- [ ] TDD mode identified at start (strict / souple / exploratory)
- [ ] Every line of production code has a test that requested it (strict)
- [ ] Watched every test fail before impl (strict)
- [ ] Every test fails for the right reason (feature missing, not typo)
- [ ] Minimal code to pass each test
- [ ] All tests pass
- [ ] Pristine output (no warnings, no errors)
- [ ] Tests use real code (mocks only where unavoidable)
- [ ] Edge cases and errors covered
- [ ] Mutation testing run + survivors handled (strict, when `commands.mutation` exists)
- [ ] Coverage verified 100% or exception documented (strict)
- [ ] Commit history shows TDD evidence or documented exception (strict)
- [ ] Refactor evaluated and applied where it has value (all Critical/High priorities addressed)

Cannot check every box in strict? You skipped TDD. Restart.

---

## When you are stuck

| Problem | Solution |
|---|---|
| Do not know how to test | Write the desired signature. Write the assertion first. Ask the user. |
| Test too complex | Design too complex. Simplify the API. |
| Must mock everything | Code too coupled. Use parameter injection (see `hexagonal-architecture` skill). |
| Huge test setup | Extract helpers. Still complex? Rethink the design. |
| Mode not obvious | Ask the user. Default to souple > strict when in doubt. |

---

## Debugging integration

Bug found? **Write a failing test that reproduces it before any fix.** Follow the TDD cycle of the applicable mode. The test proves the fix and prevents the regression.

Never fix a bug without a reproducing test.

See the `debug` skill for the upstream root-cause discipline.

---

## Final rule

```
Production code → a test exists and failed first (strict)
                → a test exists (souple)
                → the code is marked as throwaway (exploratory)
Otherwise       → this is not voidcorp tdd.
```

No exception without explicit permission from the human partner.
