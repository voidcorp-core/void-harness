---
name: verification-before-completion
activation: always
description: Final pre-flight checklist. Twelve items observed (not assumed) — typecheck, tests, hooks, mobile+desktop, commit why, review evidence. Skipping requires reason. Use at end of every task.
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: active
    codex: active
    hermes: ci-only
---

# verification-before-completion — voidcorp craftsman edition

"Task complete" claims diverge from reality when they are based on belief, not observation. Tests "passed earlier." Lint "should be clean." The mobile view "is probably fine." This skill is the final pre-flight: a twelve-item checklist, read at the end, each item OBSERVED, skipping documented.

**Attribution**: see `.source`. Primary source: superpowers/verification-before-completion + citypaul completion checklists.

---

## When to run

At the end of EVERY task before reporting "done." Even tasks that feel trivial. The checklist for a one-line fix is short; the discipline is the same.

If you find yourself wanting to skip the checklist "because it's a small change," that is the signal: run it anyway, the small ones are where it pays the most.

---

## The checklist

Read item by item. Do not run from memory. Each item is OBSERVED, not assumed.

| # | Item | Composed with |
|---|---|---|
| 1 | Typecheck passes (`tsc --noEmit`) | `typescript-strict` + `tsc-noemit-precommit` hook |
| 2 | Tests pass — **observed after last code change** | `tdd` + `testing` |
| 3 | Lint passes (Biome) | `pack-monorepo` config |
| 4 | Coverage acceptable (per `tdd` mode strict / souple / exploratory) | `tdd` |
| 5 | Hooks pass (pre-commit dry-run on staged set) | All hooks (`tdd-guard`, `tigerstyle-check`, `no-any-grep`, ...) |
| 6 | UI changes verified in BOTH mobile and desktop viewports | `frontend-design` + `accessibility-first` (mobile-first dual-quality) |
| 7 | Observability hooks present for new business logic | `observability` |
| 8 | Security review check for any boundary / auth / secret change | `security-guidance` + `harness:security-audit` |
| 9 | Documentation updated if any convention changed | `commit-discipline` "always say why" |
| 10 | Commit message includes the why (not just what) | `commit-discipline` |
| 11 | Review evidence block present in PR body (strict mode) | `code-review` |
| 12 | Spec / plan linked if work derives from one; plan resume point updated | `brainstorming` + `writing-plans` |

Items 6, 7, 8 only fire when the change touches their domain.

---

## Observed, not assumed

| Sign | What it means |
|---|---|
| "Tests should pass" | NOT observed. Run them again, then check. |
| "Linting was fine earlier" | Not observed since last change. Re-run. |
| "Mobile is probably the same" | NOT observed. Screenshot via `harness:qa` (claude-in-chrome) on a phone viewport. |
| "Sentry is set up, so observability is handled" | NOT for this code path. Did you add the breadcrumb? The log? |
| "The hook ran before, why check" | Did you edit since? If yes, run again. |

"Should" and "probably" are the words this skill exists to eliminate. The named excuses (vendored from gstack `/ship`): "should work now" → run it; "I'm confident" → confidence is not evidence; "trivial change" → trivial changes break prod. If code changed since the last run, the last run is stale.

---

## Plan completion audit (vendored from gstack `/ship`)

The 12-item checklist verifies *the build works*. This verifies *you built what was specified*. When the work derives from a plan or ticket, classify **every actionable item** against the diff:

- `DONE` / `PARTIAL` / `NOT DONE` / `CHANGED` (deliberately deviated) / `UNVERIFIABLE` (cannot be proven from the diff — cross-repo, external state, runtime-only).
- **Honesty rule**: code that *handles* a deliverable is not the deliverable. "Added the webhook handler" ≠ "the webhook fires end-to-end."
- **Per-item confirmation for `UNVERIFIABLE`**: surface each one individually and ask — never a single blanket "all done?" over a list you cannot actually verify.
- **Scope drift**: did you build exactly what was asked? Flag creep ("while I was in there…") and any missing requirement. Informational, but stated.

---

## Skipping items

Items can be skipped, but ONLY with an explicit stated reason in the completion report.

```markdown
- [x] Item 1: Typecheck passes (observed)
- [x] Item 2: Tests pass (observed, vitest run, 4/4 passing)
- [-] Item 6: UI viewports SKIPPED — no UI change in this diff
- [-] Item 7: Observability SKIPPED — pure refactor (no new business logic)
- [x] Item 9: Documentation N/A — no convention changed
- [x] Item 10: Commit message includes why (linked to spec)
- [x] Item 11: Review evidence block written
- [x] Item 12: Plan resume point updated (next step: 5)
```

Silent skipping is the bug class this skill exists to prevent. Explicit skip with reason is fine; explicit skip without reason is not.

---

## Output format

When reporting "done," include the checklist with check / skip status and the reason for any skip. The user sees the signals.

For multi-step plans (composes with `writing-plans`): update the plan's "Resume point" section with the completed step.

For PRs (composes with `code-review`): the checklist feeds the Review Evidence block — they are not separate work.

---

## Examples

### Small fix

```markdown
Done. Verification:

1. ✅ Typecheck (observed)
2. ✅ Tests pass (vitest run, 1 new test for the bug, all green)
3. ✅ Lint passes
4. ✅ Coverage holds (line + branch unchanged)
5. ✅ Pre-commit hooks (tdd-guard allowed test+fix pair, others green)
6. — N/A (no UI)
7. — N/A (no new business logic)
8. — N/A (no boundary change)
9. — N/A (no convention change)
10. ✅ Commit messages: `test: reproduce X` + `fix: <root cause>`
11. ✅ Review evidence block written (single-blocker resolved, 0 nits)
12. ✅ Spec linked (plan N/A — bug fix, no plan)
```

### Plan step

```markdown
Step 4 of plan `2026-06-01-checkout-flow-plan.md` complete. Verification:

1. ✅ Typecheck (observed)
2. ✅ Tests pass (vitest run --filter checkoutCart, 6/6 passing, mutation 96%)
3. ✅ Lint passes
4. ✅ Coverage 100% on services/checkout (strict mode)
5. ✅ Pre-commit hooks all pass
6. — N/A (use-case layer, not UI)
7. ✅ Observability: structured logs added at use-case entry/exit
8. ✅ Security: zod validation at boundary, no secret in commit
9. ✅ docs/DOMAIN.md updated with "checkout intent" term
10. ✅ Commits: test:reproduce / feat:implement / refactor:extract per Two-Hat
11. ✅ Review evidence block prepared (waiting for code-review run)
12. ✅ Plan resume point updated to Step 5

Next: invoke `harness:code-review` for the Step 4 commits.
```

---

## Composition with other skills

- **Runs LAST**, after every other skill.
- **With `tdd`**: items 2, 4 are tdd-mode-aware.
- **With `testing`**: item 2 includes "pristine output."
- **With `typescript-strict`**: item 1.
- **With `code-review`**: item 11 feeds the Review Evidence block.
- **With `commit-discipline`**: items 9, 10.
- **With `writing-plans`**: item 12 — completion updates the plan resume point.
- **With `frontend-design` + `accessibility-first`**: item 6.
- **With `observability`**: item 7.
- **With `security-guidance`**: item 8.

---

## Anti-rules

- MUST NOT define what "complete" means functionally — the task defines that.
- MUST NOT skip items silently.
- MUST NOT report completion in the middle of work (e.g., "Step 1 done, moving to Step 2" without verifying Step 1).
- MUST NOT substitute "looks fine" for observed signals.
- MUST NOT take the user out of the loop — the user sees the signals.

---

## Final rule

```
Task → all 12 items observed (or skip with stated reason) → user sees the signals → THEN report "done."
Otherwise → it is not voidcorp completion.
```

Checklists prevent omissions even for experts. The discipline pays for itself the first time it catches the test that "should have" been run.
