# Spec — `doctrine-critic` agent

Status: **designed, not implemented**. Rescopes DEV-363 (3 agents → 1).
Decision record: `docs/DECISIONS.md` § "one `doctrine-critic` agent, not the three originally planned".

This is the implementation contract for the single core agent the harness ships.
It is intentionally narrow: it covers the **one** thing no existing layer covers,
and routes everything else to the tool that already owns it.

---

## Why this agent exists (the gap)

Three layers already review code in a consumer session:

- **Hooks (8 PreToolUse)** enforce the *mechanical* doctrine floor at Edit/Write
  time, deterministically: `no-any`, `no-as-cast`, `no-console-log`, `no-null`,
  `no-only-no-skip`, `boundary-direction-check`, `test-name-lint`, `tdd-guard`.
- **Generic reviewers** judge *generic* quality: global `pr-reviewer` agent
  (TDD/TS/tests/quality), gstack `/review`, built-in `/code-review`.
- **Security**: gstack `/cso`, built-in `/security-review`, harness
  `security-guidance` skill.

None of them judges the **non-mechanical conformance to VoidCorp doctrine** — the
calls that need taste, not a grep. That judgment layer, run in an **isolated
context** so it cannot be biased by the thread that wrote the code, and
**read-only** so it cannot "helpfully" fix things, is the agent's entire reason to
exist. If a check can be a hook, it stays a hook. If a review already has an
owner, the agent hands off. What is left is this agent's scope.

---

## Frontmatter (draft)

```yaml
---
name: doctrine-critic
description: >
  Use to judge whether a diff or feature honours VoidCorp craftsman doctrine
  beyond what the hooks enforce mechanically — over-abstraction, tests that
  assert nothing, the strict-TDD Iron Law, boundaries respected in spirit, the
  anti-bloat rules on skills/hooks. Read-only, isolated. NOT a generic code or
  security review: it routes those to /code-review and /cso.
tools: Read, Grep, Glob, Bash
model: sonnet
---
```

Notes:

- **Description is deliberately disjoint** from `pr-reviewer`'s ("TDD compliance,
  TypeScript strictness, testing patterns, code quality") so auto-discovery does
  not route generic review requests here. It claims only the doctrine-judgment
  niche and explicitly disclaims generic/security review.
- **`tools` is read-only by construction**: `Read, Grep, Glob, Bash`. No `Edit`,
  `Write`, or `NotebookEdit` — the agent physically cannot mutate the tree. `Bash`
  is for *observation only* (`git diff`, `git log`, `typecheck`, `test`), never
  edits. This read-only guarantee is value the in-context skills cannot offer.
- **No Skill / nested-agent invocation.** The agent does not run `/cso` or
  `/code-review` itself (nested agents are heavy and gstack may be absent in a
  consumer). It *names the handoff* in its output and lets the main thread run it.
- `model: sonnet` mirrors `pr-reviewer`; revisit only with evidence.

---

## When it is invoked

- Explicitly: "doctrine-critic this", "check this against void doctrine", before
  opening a PR on a project that installed the harness.
- Proactively: when a feature/diff is ready for review **and** `.void/config.json`
  exists (doctrine is installed). It must NOT fire on every edit (the hooks do that).

Input: the diff under review (`git diff` against the base branch) plus the skills
and hooks the project has installed.

---

## Scope — what it judges (and nothing else)

The checklist is the *non-mechanical* doctrine. Each item is a taste call a grep
hook cannot make:

1. **Test meaning, not test presence.** `tdd-guard` proves a sibling test file
   exists; it cannot see that the test asserts nothing, mirrors the implementation,
   or tests the framework. The critic reads the tests.
2. **Iron Law (strict mode).** Did a behaviour change land without a failing test
   first? Judged from the diff's commit shape and the `.void/config` mode for the
   touched path — not enforceable by a single hook.
3. **Boundary spirit.** `boundary-direction-check.sh` blocks the wrong import
   direction; it cannot see a domain leaking infrastructure concerns through a
   "clean" interface. Hexagonal/DDD in spirit.
4. **Over-abstraction / YAGNI.** Premature generalisation, indirection with one
   caller, a factory for a single type. Pure judgment.
5. **Anti-bloat rules on harness artifacts** (when the diff touches the harness or
   a consumer's own skills/hooks): ≤ 400 lines/skill, one subject/skill, overlap
   < 30 %, description ≤ 200 chars, hooks ≤ 100 lines, agent scope discipline.
6. **Commit "why".** Conventional commit present but the body explains *what*, not
   *why* — the convention met by the letter, not the intent.

### Explicitly out of scope — routed, not re-implemented

- **Line-level bugs, correctness, perf** → recommend `/code-review` (or its
  `ultra` mode for deep multi-agent passes).
- **Security (OWASP/STRIDE/secrets/supply-chain)** → recommend `/cso`. The
  critic only *detects* trust-boundary code (new input, auth, SQL, LLM I/O, env)
  and flags "run /cso here", consistent with the `security-guidance` skill.
- **QA / design / shipping** → stay in gstack (`/qa`, `/design-review`, `/ship`).
  Anti-bloat rule 6: never spill here.

---

## Output format

A structured verdict to the main thread (the agent's final message *is* the
result; it does not post to GitHub — that is `pr-reviewer`'s job):

```
## doctrine-critic verdict — <PASS | CHANGES REQUESTED>

### Blockers (doctrine violations)
- <file:line> — <rule> — <what, and why it violates the doctrine>

### Nits (taste, non-blocking)
- <file:line> — <observation>

### Handoffs (owned by another tool, not judged here)
- Security: trust-boundary code at <file:line> → run /cso
- Bugs/perf: → run /code-review
```

`PASS` only when zero blockers. Each blocker cites the doctrine rule by name so the
verdict is auditable, not vibes.

---

## Files to produce when implementing (per DEV-363 + sourcing discipline)

- `packages/core/agents/doctrine-critic.md` — the agent (this spec, realised).
- `packages/cli/core-assets/agents/doctrine-critic.md` — mirror; confirm
  `scripts/copy-core-assets.mjs` copies `agents/`.
- `packages/core/agents/doctrine-critic.source` — inspirations + URLs
  (`pr-reviewer-citypaul`, superpowers `code-reviewer`, the harness `code-review`
  and `security-guidance` skills it composes around).
- `plans/skill-audits/doctrine-critic.md` — audit note: what was adapted, and the
  explicit rejection of the two dropped agents.
- `packages/core/.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
  — declare the agent; flip "3 agents on the roadmap" → "doctrine-critic agent
  (shipped)".
- `README.md` + `docs/ARCHITECTURE.md` trees — replace
  "planned: senior-reviewer, security-reviewer, architect-critic" with
  "doctrine-critic".
- Tests: frontmatter validity (read-only `tools`, description ≤ 200 chars) + the
  manifest wires the agent. The "3 agents" assertions become "1 agent".

## Open question for implementation

Verify the exact Claude Code **plugin** manifest shape for declaring an agent
(does `plugin.json` reference `agents/` by directory, or list files?) **before**
wiring — CLAUDE.md hard rule: read the third-party docs first, do not guess the
schema. The frontmatter above follows the standalone-agent convention observed in
`~/.claude/agents/pr-reviewer-citypaul.md`; confirm it is identical inside a plugin.
