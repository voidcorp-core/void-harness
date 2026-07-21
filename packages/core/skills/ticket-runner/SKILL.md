---
name: ticket-runner
description: Use when taking a single ticket from ready through shipped at expert-team quality. Triggers on starting a ticket, taking an issue, or picking up a backlog item to execute.
owner: folpe
runtimes: [claude, codex]
enforcement:
  floor: ci
  inline:
    claude: active
    codex: active
    hermes: ci-only
---

# ticket-runner

One ticket, taken from ready to shipped, with the coverage a senior expert team would give it: architecture, tests, end-to-end, UX, security, review. This is the single canonical definition of "execute one ticket well." Both interactive work and `harness:backlog-autopilot` delegate here, so the cycle is defined once and improving it improves both.

**Core principle:** Speed comes from skipping ceremony on trivial work, never from skipping a pass whose trigger fired. The triage is keyed to observable predicates (does it touch a boundary, a UI, a trust edge), not to a feeling that the change "looks simple."

**Attribution**: see `.source`.

---

## When to invoke

- Starting any single ticket or issue you intend to implement and ship.
- Once per ticket by `harness:backlog-autopilot` (the per-ticket cycle IS this skill, run inside a worktree subagent).
- After `harness:ticket-writer` produced the ticket: its declared passes are an accelerator HINT. You ALWAYS evaluate the predicates yourself; a declaration may only ADD a pass, never cancel one whose predicate fired.

Do NOT use this to plan several tickets (that is `harness:writing-plans`) or to author the ticket itself (`harness:ticket-writer`).

---

## The cycle

Run in order. Each pass names the skill it composes and the predicate that fires it. `ALWAYS` passes never skip; conditional passes skip only when their predicate is false. You ALWAYS evaluate every predicate yourself against the actual change: a ticket-writer declaration may ADD a pass, never cancel one whose predicate fired.

1. **Ingest + completeness gate** (ALWAYS). Read the ticket: scope, AC, DoD, edge cases, declared passes. Confirm nothing is missing or ambiguous. If a gap or uncovered angle exists, loop back to `harness:ticket-writer` to complete it before coding, do not paper over it. Move the ticket to **In Progress**.
2. **Architecture pass** (IF it touches structure, a module boundary, the data model, or public types). Compose `harness:hexagonal-architecture`, `harness:domain-driven-design`, agents `type-design-analyzer` + `doctrine-critic`. Confirm the applicable ADR is honored.
3. **Migration safety** (IF it changes a DB schema or ships a migration). Compose `harness:migrations-safety` (and `harness-server:drizzle-migration-safe` on a Drizzle/Postgres stack): zero-downtime, two-phase, batched backfill, locking analysis. **Once the migration is generated and safety-reviewed, apply it to the dev/local database before the TDD and E2E passes run** — otherwise those tests execute against a stale schema and prove nothing about the new shape. **This cycle only ever applies to dev/local; production migrations run through CI / GitHub Actions on merge, never from a worker or this session** (see the `harness:migrations-safety` anti-rule). A schema change must never reach the rest of the cycle without this pass.
4. **TDD implementation** (ALWAYS). Compose `harness:tdd` + `harness:testing`. Red, green, refactor. Unit tests for the behavior, green before moving on.
5. **Async + idempotency** (IF it sends email, calls an external side-effecting API, enqueues a job, or mints a single-use token). Compose `harness:async-safety`: idempotency keys, replay/dedup window, bounded retries, single-use enforcement.
6. **End-to-end tests** (IF it touches a user-facing flow). Write/extend the E2E suite (Playwright). The path a user actually walks, not just the unit.
7. **UX/UI pass** (IF it touches a UI surface). The interface is held to production craft, not just "it renders". Compose `harness:frontend-design` (build-time craft) + `harness:ui-review` (the audit/critique ceiling: AI-slop test, squint test, interaction-state coverage, technical audit) + `harness:accessibility-first`, across the baseline (BACK+FRONT parity, mobile and desktop, and the states a user actually hits — loading / error / empty). Browser-verified QA (live screenshots) runs via `harness:qa` (the claude-in-chrome MCP). A UI ticket is not shippable until this pass is **verified, not assumed**.
8. **Security pass** (ALWAYS a quick scan; DEEP if it touches a trust boundary: external input, auth, RLS/tenancy, untrusted content, secrets, or a side-effecting action). Compose `harness:security-guidance` + `harness:security-audit`.
9. **Review** (ALWAYS). Compose `harness:code-review` + agents `doctrine-critic` + `silent-failure-hunter` + the project's own reviewer (e.g. a `pr-reviewer` agent) when present. On a high-stakes diff, add one **independent fresh-context adversarial pass** (a subagent thinking like an attacker + chaos engineer, blind to the authoring thread); classify each finding FIXABLE vs INVESTIGATE, and end on a recommendation that names the single most exploitable finding (a generic reason disqualifies it). Findings agreed by more than one independent pass are high-confidence. *Vendored from gstack `/ship`.*
10. **Verification before completion** (ALWAYS). Compose `harness:verification-before-completion`: typecheck, tests, hooks, both viewports, all observed not assumed. **A red suite is adjudicated before proceeding** (from gstack `/ship`): each failure is *in-branch* (you touched the test/code, or it traces to the diff → it is yours, fix it) or *pre-existing* (neither touched → offer fix / TODO / skip); ambiguous defaults to in-branch. Test on the **merged base**, not the stale branch.
11. **Ship** (ALWAYS). Compose `harness:commit-discipline`, open the PR, move the ticket to **Done**. Commits are **bisectable** — one logical change each, dependency-ordered (infra → domain + tests → edge/UI + tests), each independently valid. In backlog-autopilot the worker never opens the PR (the reconciliation subagent does); it stops at green branch.

---

## Triage: what "fast" means

Evaluate every predicate against the actual change. Never let an upstream declaration suppress a pass whose predicate is true.

| Pass | Fires when | Skippable |
|------|-----------|-----------|
| Ingest + completeness | always | no |
| Architecture | structure / boundary / data model / public type | yes |
| Migration safety | DB schema change or migration | yes |
| TDD implementation | always | no |
| Async + idempotency | email / external side effect / job / single-use token | yes |
| End-to-end tests | user-facing flow touched | yes |
| UX/UI | UI surface touched | yes |
| Security | always (deep if trust boundary) | no (depth varies) |
| Review | always | no |
| Verification | always | no |
| Ship | always | no |

"Fast" = skip the passes whose predicate is false. It never means skipping an `ALWAYS` pass, or one whose predicate fired, to save time.

---

## Red flags: STOP, you are skipping a triggered pass

| Rationalization | Reality |
|-----------------|---------|
| "One-line change, skip the review" | Review is ALWAYS. One-liners ship the worst regressions. |
| "No UI here, skip security" | Security quick-scan is ALWAYS; a backend input is a bigger injection surface than a button. |
| "Tests after, ship now, it works" | TDD is ALWAYS. Tests written after green prove nothing about intent. |
| "It hits a trust boundary but it is internal" | Internal still gets the DEEP security pass. Tenancy leaks are internal. |
| "Going fast means skipping E2E" | Fast skips passes whose PREDICATE is false, not the ones that fired. |
| "The ticket looked complete, skip the gate" | The gate is one read. A missing edge case found now is hours saved later. |
| "It renders, ship the UI" | Rendering is not craft. The UX/UI pass runs `frontend-design` + `ui-review` (audit) — hierarchy, motion, states, mobile, anti-slop, not just "it appears". |

Violating the letter of the triage is violating its spirit: the predicate decides, not the vibe.

---

## Model tier by pass (frugality, no quality loss)

Tokens follow stakes: mechanical work runs cheap, judgment runs at full strength. This never cheapens a judgment pass — the predicate that fires a pass also sets its tier.

- **Mechanical (may run a cheaper model)**: the ingest read, artifact/mirror regeneration, a trivial edit whose predicate fired nothing else.
- **Judgment (stay top-tier)**: architecture, DEEP security, the review adversarial pass, verification adjudication of a red suite, and any brainstorm/design step.
- **Subagents carry their own tier**: `doctrine-critic` / `silent-failure-hunter` / `code-explorer` run sonnet; `type-design-analyzer` runs sonnet, `migration-planner` opus (see the agent frontmatter). This skill composes them; it does not override their tier.
- **Interactive vs worker**: run interactively, the cycle uses the session model (the human's choice); the tiering above is realized when the cycle runs as a `harness:backlog-autopilot` **worker**, where the worker's model is set from the ticket's stakes (`workerTier`, top-tier by default). A light ticket's whole cycle runs cheaper; a high-stakes one stays full-strength.

## Composition

Upstream: `harness:ticket-writer` produces the ticket and declares its conditional passes. Caller: `harness:backlog-autopilot` runs this once per ticket in parallel worktrees. Every pass here is an existing skill or agent; this skill is the conductor, not a reimplementation of any of them.
