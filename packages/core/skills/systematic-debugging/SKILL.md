---
name: systematic-debugging
description: Four phases (investigate, analyze, hypothesize, implement). Iron Law: no fix without a failing test reproducing the bug AND a root cause. Bug fix commit pairs. Use on bug or test failure.
owner: folpe
---

# systematic-debugging — voidcorp craftsman edition

A bug fix without a root cause is a band-aid. The bug recurs in three months under a different name, and the next debugger inherits the band-aid. `systematic-debugging` enforces four phases (investigate → analyze → hypothesize → implement), with a failing test that reproduces the bug landing BEFORE the fix.

**Attribution**: see `.source`. The gstack `/investigate` methodology is vendored here (DEV-388); the four-phase discipline is `superpowers:systematic-debugging`.

---

## Iron Law

```
No fix without:
  (a) a root cause identified, AND
  (b) a failing test that reproduces the bug.
```

"It works now" is not a root cause. Suspect cosmic-ray fixes.

---

## Four phases

### Phase 1 — Investigate (gather evidence)

Collect what you can OBSERVE before reasoning. The goal is signal, not theory.

- Reproduce the bug at least once locally (or capture the prod conditions if not).
- Gather: stack trace, recent commits, related logs, recent infra changes, recent migrations.
- Note: when did it start? What changed?
- If reproduction requires data you do not have, **invoke `observability` first** — add the visibility, then come back.

Deliverable: a one-paragraph timeline + reproducible steps (or a recorded "last working commit").

### Phase 2 — Analyze (find the pattern)

Find the smallest example that reproduces. Narrow the search space:

- **Time**: binary-search the commit history. Last working SHA? First failing SHA?
- **Code**: which module? Which file? Which function?
- **Input**: which value class? Boundary case? Empty? Negative?
- **Environment**: which user? Which region? Which browser? Which timezone?

Apply **5 Whys** (Toyota): for non-obvious bugs, ask "why does this happen" 3–5 times until you stop hitting symptoms.

Deliverable: narrowed reproduction + 5-Whys chain (in the PR body later).

### Phase 3 — Hypothesize (testable theory)

State the root cause as a theory you can test:

> "The validation runs before authentication. An unauthenticated user can trigger expensive DB lookups by sending an invalid payload."

A good hypothesis:

- Explains the observation (necessary condition).
- Predicts the behavior change after fix (sufficient condition).
- Is testable — you can write a failing test for it.

If the hypothesis does not predict a falsifiable behavior change, it is a guess. Keep analyzing.

### Phase 4 — Implement (fix + verify)

In this order:

1. **Write the reproducing test** (in `strict` mode per `tdd`). It must fail on `main`.
2. **Commit**: `test: reproduce <bug summary>`.
3. **Implement the fix**. The test now passes; other tests still pass.
4. **Commit**: `fix: <root cause description>`. Composes with `commit-discipline` (the "why" is the root cause).
5. **Verify pristine output** — no warnings, no leaked logs.
6. **Root-cause section in PR body** — see template below.

### Banned

- Combining the reproducing test and the fix in one commit. Bug fix commit pairs are non-negotiable.
- Adding the test "later" after the fix.
- Marking the bug closed without an explanation that survives scrutiny.

---

## Root-cause section in PR body

Every bug-fix PR includes:

```markdown
## Root cause

**Symptom**: <one sentence — what the user saw>

**Narrowing**:
- Last working commit: <sha or "unknown — first observed in prod">
- Smallest reproduction: <steps or test>
- Affected paths: <files / endpoints / users>

**5 Whys**:
1. Why does the API return 500? → unhandled exception in checkoutCart
2. Why is the exception unhandled? → repository returns null instead of Result
3. Why does the repository return null? → migration added column but seed lacks it
4. Why does the migration not include the seed? → seed file path not tracked by migration runner
5. Why is the seed file path not tracked? → introduced in PR #142, never run in CI
→ Root cause: PR #142 introduces seed-coupled migrations without CI coverage

**Fix**: <one sentence>

**Prevention**: <how this class of bug is now caught — usually a new test, a new hook,
or an ADR>
```

This section persists. `git blame` archaeology rewards the next debugger.

---

## When the root cause is "we cannot see what happened"

If Phase 1 cannot reproduce because production lacks visibility:

1. **STOP debugging the symptom.**
2. **Invoke `observability`** — add structured logs, trace IDs, breadcrumbs, error boundaries at the suspect surface.
3. **Deploy the observability fix** (with `commit-discipline` "why: investigating prod issue X").
4. **Wait for the next occurrence** — now with signal.
5. **Resume systematic-debugging Phase 1** with real data.

Guessing in the dark produces "fixes" that may move the bug rather than solve it.

---

## When the root cause is structural

If Phase 3 hypothesis is "the architecture allows this state to exist":

- The fix is a refactor (composes with `refactoring` and `hexagonal-architecture` / `domain-driven-design`).
- Invoke the `doctrine-critic` agent to judge the structural root before the refactor.
- Compose with `brainstorming` + `writing-plans` if the refactor is large enough to need a spec.
- Two-Hat principle: the structural fix (refactor) and the bug close commit separately — though they live in the same PR with explicit ordering.

---

## Flaky tests are bugs too

A "flake" is a non-deterministic test. It is a bug — not a CI inconvenience to retry around.

Run `systematic-debugging` on the flake:

- Phase 1: gather flake conditions (which CI run, which time of day, which order).
- Phase 2: narrow — timing assumption? Shared state? Network? Randomness without a seed?
- Phase 3: hypothesis (e.g., "test depends on global Date — fix by injecting a clock port").
- Phase 4: failing test that DEMONSTRATES the flake, then the fix.

Retry-until-green is rejected.

---

## Diagnostic aids (vendored from gstack `/investigate`)

**Pattern lookup** — before theorizing, match the symptom against a common class:

| Pattern | Signature | Where to look |
|---|---|---|
| Race condition | intermittent, timing/load-dependent, "works when I step through" | shared mutable state, missing `await`, unordered async |
| Nil propagation | NPE / undefined far from its origin | an optional assumed present at a boundary |
| State corruption | wrong value, no error | a write path skipping validation, or a stale cache |
| Integration failure | works in isolation, fails wired up | contract mismatch at the adapter, env / config drift |
| Config drift | works locally, fails in one env | env-specific value, unpinned dependency |

**Instrument to confirm, before editing.** Add a temporary log/assertion at the suspected cause and match it against the reproduction *before* writing any fix. A hypothesis you have not observed is still a guess.

**3-strike rule.** Three failed hypotheses → stop treating it as a simple bug. It is likely architectural: instrument-and-wait, or escalate to a structural review (see "When the root cause is structural").

**Blast-radius gate.** If the fix touches > 5 files, stop and ask: proceed / split / rethink. A wide fix for a narrow bug is usually the wrong layer.

**Recurring bug = architectural smell.** `git log` the affected files for prior fixes. The same file fixed three times is not coincidence — the root is structural, not the latest symptom.

**Red flags** (each means you are guessing): "a quick fix for now" (there is no for-now); proposing a fix before tracing the data flow; each fix revealing a new problem (wrong layer).

---

## Composition with other skills

- **Upstream — `observability`**: if visibility is the gap, fix it first.
- **With `tdd`**: the reproducing test is written in strict mode. The fix follows the cycle.
- **With `code-review`**: PR body includes the root-cause section. The reviewer verifies the test reproduces the bug before the fix.
- **With `refactoring`**: structural fixes compose with refactoring's Two-Hat principle.
- **With `doctrine-critic` agent**: for structural roots affecting multiple bugs of the same kind.
- **With `commit-discipline`**: `fix:` commits include the "why" (root cause).
- **`gstack:/investigate` is fully vendored here** (DEV-388): its diagnostic aids (pattern lookup, 3-strike, blast-radius, instrument-to-confirm) are the section above; the phase skeleton + Iron Law + regression-test rule were already this skill's core (deliberately not re-vendored).

---

## Anti-rules

- MUST NOT close a bug without a root cause the developer can explain.
- MUST NOT allow "I will add the test later" — the test exists alongside or before the fix.
- MUST NOT permit retry-until-green for flakes.
- MUST NOT silently widen the scope of the fix PR (Two-Hat).
- MUST NOT skip observability when the root cause is visibility.
- MUST NOT defer to `migrations-safety` for non-migration bugs.

---

## Final rule

```
Bug → investigate → analyze → hypothesize → reproduce in test → fix → verify → PR with root cause.
Otherwise → it is not voidcorp systematic-debugging.
```

The discipline pays off the second time the bug would have recurred — and it does, often.
