---
name: code-review
activation: always
description: Pre-PR critical pass. Six dimensions (correctness, tests, security, structure, readability, perf). Two modes (strict/souple). Composes the native /code-review and codex CLI. Use on a diff.
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

# code-review — voidcorp craftsman edition

A review without a framework is "the first ten things I noticed." This skill provides the framework: six dimensions in order, blocker vs nit, evidence block in the PR body, two modes, explicit composition with Claude Code's native `/code-review` and specialized agents. The skill orchestrates; it does not duplicate the deep-pass agents.

**Attribution**: see `.source` in this directory.

---

## Six dimensions, in order

The order matters. A correctness issue blocks regardless of beautiful structure. A perf issue does not block if the first four dimensions are clean.

1. **Correctness** — does it do what it claims? edge cases? error paths? composes with `tdd` (cycle evidence) and `systematic-debugging` (root cause for fixes).
2. **Tests** — failing test before the code? real code over mocks? names describe behavior? composes with `testing`.
3. **Security** — input validated at trust boundaries? secrets handled? SQL safe? LLM input untrusted? composes with `security-guidance` (which routes deep audits to `harness:security-audit`).
4. **Structure** — boundaries respected (no domain importing infrastructure)? service/repository split? function lengths? composes with `hexagonal-architecture`, `domain-driven-design`, `refactoring`, and the `doctrine-critic` agent.
5. **Readability** — names? exhaustive switches? `any` slips? `as` casts? composes with `typescript-strict`.
6. **Performance** — obvious O(n²) inside loops? leaky reactive subscriptions? unbounded queries? measured claims come from the project's perf tooling (Lighthouse CI, bundlesize), not guesses.

A11y, observability, LLM cost discipline ride inside dimensions 1-6 (e.g. missing a11y is a Correctness issue at the UI boundary; missing structured log is a Structure issue at the service layer).

### Leverage hierarchy in review

Spend attention where defects cost the most. An upstream design or contract flaw (Correctness, Structure) cascades through everything downstream; a code-detail nit (Readability) stays local. Surface the high-leverage defects first, and weight scrutiny toward them.

Do not over-engineer the review itself: report only what touches correctness or the stated requirements, not every possible finding. A reviewer who flags every theoretical improvement buries the one BLOCKER that matters. When in doubt, the bar is "would shipping this without the fix be wrong?" — if not, it is at most a `NIT:`.

---

## Blocker vs nit

Every comment is explicitly prefixed:

- **`BLOCKER:`** — must be fixed before merge. Block the PR.
- **`NIT:`** — suggestion. Author decides. Does NOT block.
- **`QUESTION:`** — clarification request. May escalate to BLOCKER if answer reveals a defect.
- **`PRAISE:`** — explicit acknowledgement of good code (rare, but valued).

Style / naming / minor structure: `NIT:`. Correctness / missing test / security / boundary violation: `BLOCKER:`.

A review that does not use the prefixes is incomplete. The companion hook `blocker-prefix-grep` produces the BLOCKER/NIT count for the evidence block.

---

## PR body — review evidence

Every PR in strict mode includes a Review Evidence block:

```markdown
## Review Evidence

- **Mode**: strict
- **Composed with**: native /code-review medium, codex CLI (second opinion)
- **Dimensions covered**:
  - [x] Correctness — tdd evidence verified (RED commit c925187, GREEN 5e0055b)
  - [x] Tests — 4/4 passing, mutation score 94%, no business mocks
  - [x] Security — trust boundary validated via Zod at /api/checkout
  - [x] Structure — services do not touch DB (repository pattern verified)
  - [x] Readability — typescript-strict clean (no any, no rogue as)
  - [x] Performance — no measured claim, no obvious smell
- **Blockers raised**: 0
- **Nits raised**: 2 (variable rename suggestion, helper extraction suggestion)
- **Claude vs Codex disagreement**: none
- **Skipped dimension**: none
```

If a dimension is skipped, the reason is explicit. If Claude and Codex disagree, the deltas are surfaced — not silently arbitrated.

The companion hook `pre-PR-review-evidence` warns if the PR body lacks this block (strict mode).

---

## CL Size discipline

PRs larger than ~400 LOC of diff should either:

- Be split into multiple PRs each focused on one concern
- Or include a `large-cl-justification: <reason>` marker in the PR body

Review quality decays after ~400 LOC. The companion hook `large-cl-grep` warns on PRs exceeding the threshold without the justification marker.

---

## Modes

| Mode | Trigger | Posture |
|---|---|---|
| **strict** | PR targeting `main` / `develop` / release branches. Pre-PR final pass. | All six dimensions checked. Blockers fail. Evidence block REQUIRED. Default effort: native `/code-review medium`, escalate to `ultra` for high-stakes diffs. Optional codex CLI second opinion. |
| **souple** | In-progress feedback on a feature branch during work. WIP commits. | Dimensions checked at user discretion. No evidence block required. Default effort: native `/code-review low` or `medium`. |

---

## Composition with specialized agents and tools

| Dimension | Composed with |
|---|---|
| Correctness, Tests | `tdd` skill (verify cycle), `testing` skill (verify quality), `doctrine-critic` agent (doctrine conformance) |
| Security | `security-guidance` skill, `doctrine-critic` agent (flags boundaries), `security-audit` (only at user request for full audit) |
| Structure | `hexagonal-architecture` skill, `domain-driven-design` skill, `doctrine-critic` agent (boundary spirit) |
| Readability | `typescript-strict` skill, Biome (formatter) |
| Performance | the project's perf tooling (Lighthouse CI, bundlesize) for measured claims; this skill flags only obvious smells |
| Independent second opinion | `codex review` (the codex CLI's non-interactive review; a different model family, catches different bug classes) |
| Diff analysis at high effort | native `/code-review medium` / `high` / `ultra` |

The skill is the orchestration. Specialized agents and the native `/code-review` do the heavy work.

---

## Operating procedure

### Pre-condition (strict mode)

- The PR's HEAD has been built and tested locally / in CI. No build errors, no failing tests, no lint warnings.
- Pristine output verified (no `console.log` in production code, no leaked warnings).
- The PR description includes a clear "what" and "why."

If any pre-condition fails, the review pauses — fix the pre-condition first.

### Pass

1. Run the native `/code-review <effort>` to enumerate findings.
2. Walk the six dimensions in order. For each:
   - Compose with the specialized skill / agent if applicable.
   - Tag findings as `BLOCKER:` / `NIT:` / `QUESTION:` / `PRAISE:`.
3. If strict mode and high stakes: run `codex review` (the CLI's non-interactive review subcommand) for an independent cross-model pass. Surface disagreements explicitly.
4. Compose the Review Evidence block.
5. If blockers remain: PR is not ready to merge. Author addresses.
6. If only nits: PR can merge once author has read the nits (no obligation to address each).

### Author response (Google practices)

- Address every BLOCKER (fix or reasoned pushback).
- Read every NIT. Address those you agree with; ignore the rest.
- Treat QUESTION as a thinking prompt — answer or escalate.
- Push back when you disagree. Reviewer may hold ground with a clear "why."

---

## Banned

### "LGTM" reviews

A review that does not list the dimensions checked is not a review. Even "everything looks fine" requires the evidence block in strict mode.

### File-by-file linear walk

Default to dimension-by-dimension across the whole diff. Linear walk misses cross-file issues (service change without its repository update, schema change without its consumer update).

### Style / naming bikeshedding marked as BLOCKER

Style is solved by Biome + `typescript-strict`, not by reviewer preference. Anything stylistic is `NIT:` at most.

### Architectural-rewrite suggestions inside the PR

If the diff reveals a structural problem larger than the diff, add a `QUESTION:` comment + suggest a follow-up issue. Do not block on "rewrite this PR." Scope creep at review time tanks velocity.

### Silent disagreement between Claude and Codex

Disagreements are surfaced. Not averaged. The user decides.

---

## Composition summary

- **Upstream**: `verification-before-completion` (the author claims the code is ready before review starts).
- **Downstream**: `commit-discipline` (the merge commit follows conventional commit + always-say-why), then the ship step (`ticket-runner` pass 11 + `gh` lands the PR; release-please owns versions).
- **Side-by-side**: the `doctrine-critic` agent (doctrine conformance, read-only).

---

## Companion hooks

- **`pre-PR-review-evidence`** (pre-push) — warn if PR body lacks the Review Evidence block (strict mode)
- **`large-cl-grep`** (pre-push) — warn if PR contains > 400 LOC of diff without `large-cl-justification:` marker
- **`blocker-prefix-grep`** (post-review) — informational: count BLOCKER vs NIT comments for the evidence block

See `../../hooks/`.

---

## Anti-rules

- MUST NOT decide whether to ship — user owns the merge decision.
- MUST NOT block on style / naming (Biome + `typescript-strict` jobs).
- MUST NOT suggest scope expansion inside the PR — escalate to follow-up.
- MUST NOT duplicate `doctrine-critic` or `harness:security-audit` work — delegate.
- MUST NOT silently arbitrate Claude-vs-Codex disagreements — surface them.
- MUST NOT mark style nit as BLOCKER.
- MUST NOT pass a review when the test suite has not been observed passing on the PR's HEAD.

---

## When you are stuck

| Problem | Solution |
|---|---|
| Review feels shallow | You skipped a dimension. Walk all six in order. |
| Cannot tell BLOCKER from NIT | Correctness / security / missing test / boundary violation = BLOCKER. Everything else = NIT. |
| Diff is too large to review | Ask the author to split, or invoke `large-cl-justification:` if truly atomic. |
| Found a structural rot beyond the diff | `QUESTION:` + suggest follow-up issue. Do not block this PR on it. |
| Claude and Codex disagree | Surface the delta. Let the author/user decide. |
| Cannot reach pristine output | Pre-condition failed. Pause the review until fixed. |

---

## Final rule

```
A review → six dimensions in order, blockers explicit, evidence in PR body (strict), delegated where deep.
Otherwise → it is not a voidcorp code-review.
```

The review is the second pair of eyes. Two model families is two thirds. The author owns the code.
