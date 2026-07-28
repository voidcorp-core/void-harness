# CLAUDE.md — void-harness

> **Sister doc**: `AGENTS.md` is the Codex-flavored mirror of this file. The two are maintained in sync — any change to one MUST be reflected in the other in the same commit. A pre-commit hook (see `scripts/sync-agent-docs.sh`, Phase A) enforces this. Adapted terminology only (Claude/Skill tool ↔ Codex/tools); the doctrine is identical.

You are working inside the **void-harness** repo itself — the meta-repo that produces the harness (Claude Code + Codex) for every VoidCorp project. This file governs work **on the harness**, not work on projects that consume it.

## What this repo is

A **public, MIT** harness installed free and account-free via `npx voidharness` (the npm package is the primary channel; the voidcorp marketplace is self-hosted in this repo — `.claude-plugin/marketplace.json` lists every plugin as a local subdirectory — as an optional secondary channel; see `docs/DECISIONS.md`). It injects opinionated Claude Code configuration into any project:

- **Core** (`packages/core/`) — universal craftsman skills, agents, hooks, CLAUDE.md modules
- **Packs** (`packages/packs/*`) — stack-specific add-ons activated per project
- **CLI** (`packages/cli/`) — install / add / update / doctor commands

## Read before writing

1. `README.md` — vision + target architecture
2. `docs/PHILOSOPHY.md` — three pillars (safety / performance / DX) + sources
3. `docs/ARCHITECTURE.md` — package boundaries + dependency direction
4. `plans/` — current and past design specs

## Active program bootstrap

`plans/ACTIVE.md` is the durable cross-session handoff when it exists with
`status: executing`. Before choosing implementation work, read it, then read the global plan and
spec it references. If the user asks to continue, start, or resume without naming a ticket, do not
ask them to repoint the session:

1. query the configured tracker scope and recover any already-started ticket;
2. otherwise select the next ready ticket from native tracker state and `blockedBy` relations;
3. fetch the complete ticket and relations before acting;
4. execute that unit with `harness:ticket-runner`;
5. keep the tracker state, assignee, evidence/PR links, blockers, and resume comment current.

The tracker owns mutable execution state; `plans/ACTIVE.md` never stores a hand-maintained “next
ticket”. If the tracker is unavailable, stop rather than infer progress locally. A specific user
request overrides automatic selection. Human gates and merges remain human.

## Anti-bloat discipline

Seven hard rules. **Any PR violating these is blocked.**

1. **≤ 400 lines per skill.** No exception. If you need more, split.
2. **One skill = one subject.** A skill that talks about TDD AND mutation testing splits into two.
3. **No responsibility overlap > 30%** between two skills. If detected, fuse or clarify boundary.
4. **Frontmatter `description` ≤ 200 chars**, precise enough that auto-discovery picks the right skill from the description alone.
5. **Hooks ≤ 100 lines**, shell or simple TS. No DSL maison, no framework. Shared logic goes in a sourced, `_`-prefixed hook library (e.g. `hooks/_hooklib.sh`), which is exempt from the per-hook cap.
6. **Agents have an explicit scope**. `doctrine-critic` judges code against doctrine — it does not also do QA, design, or shipping (those are their own skills/workflows).
7. **Skill tests pass in CI.** A broken skill blocks the release.

## Sourcing discipline (no verbatim vendoring)

Core skills are **distilled and adapted** from external sources (superpowers, citypaul, TigerStyle, etc.) — never copied verbatim. Verbatim vendoring was rejected: it freezes upstream bugs and creates a fork burden.

For each skill:

- Read the source, extract the load-bearing principles ("why it works")
- Rewrite for void-harness, removing what doesn't fit, adding what's missing
- Add a `.source` file next to the skill listing inspirations + URLs
- Document the specific adaptations and rejections in `plans/skill-audits/<skill-name>.md` (one audit note per skill)
- **Never reinvent without justified improvement.** YAGNI applies hardest here.

A skill that ends up 95% the same as its source remains valuable as "voidcorp's deliberately authored version" — but it was rewritten, not pasted.

## Hard rules for any code added to this repo

- Match file naming exactly per convention (`Name.ts`, `Name.test.ts`, etc.)
- Pure helpers: no I/O, no side effects
- No `console.log` in committed code — use the project logger
- No em dashes or emojis as AI-slop filler. Both are allowed where they carry meaning (typographic separators in prose, glyphs in code such as the render layer); just do not sprinkle them decoratively. Not a hard CI gate.
- Read the official documentation of any third-party tool **before** writing its config
- Conventional commits, every message ends with **why**, not just **what**

## Meta-rules

- Any new convention added in a commit MUST be reflected in `docs/*.md` in the same commit
- Any non-obvious decision (where a credible alternative exists) MUST be created as its own collision-free file with `void-harness decisions new`; accepted records are immutable and changes supersede them. `docs/DECISIONS.md` is a frozen legacy landing page, never a worker-owned artifact; `pnpm decisions:check` gates structure and immutability.
- Removed concepts must be removed from the docs at the same time
- Tests run via `pnpm test`; do not skip TDD when adding logic
- Versions are never hand-edited: release-please bumps every manifest in lockstep from Conventional Commits, and `pnpm version:check` fails CI on any drift (see `docs/RELEASING.md`)

## Skill routing inside this repo

| Task                                     | Skill / Tool                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Brainstorming the next feature           | `harness:brainstorming`                                                              |
| Writing a plan                           | `harness:writing-plans`                                                              |
| Reviewing a written plan (pre-execution) | `harness:plan-review` (lenses CEO/Eng/Design/DevEx, or `all`)                        |
| Implementing a ticket / feature          | `harness:ticket-runner` (one unit, ready→shipped: TDD, UX, security, review, verify) |
| Decomposing work into tickets            | `harness:ticket-writer`                                                              |
| Draining independent tickets in parallel | `harness:backlog-autopilot`                                                          |
| Adding a skill                           | `superpowers:writing-skills` (until vendored)                                        |
| Building or auditing a UI                | `harness:frontend-design` (build) + `harness:ui-review` (audit/critique/polish)      |
| Auditing a live dev surface (API/CLI/SDK/docs) | `harness:devex-audit` (measured TTHW, error-path tracing, evidence-backed DX scorecard) |
| Live browser QA of a running web app     | `harness:qa` (claude-in-chrome MCP: explore, states, atomic fix loop, report; `--report-only` for no-fix) |
| Periodic engineering retrospective       | `harness:retrospective` (window signals → improvement decisions → learning-capture)  |
| Ship a PR                                | `harness:ticket-runner` pass 11 + `harness:commit-discipline` + `gh` (release-please owns versions/changelog) |

## On gstack and superpowers

- **gstack** stays installed globally (`~/.claude/skills/gstack/`) pending the Vague 6 teardown (DEV-395). QA, design, browser, and ship are now harness-native (`harness:qa`, `harness:ui-review`/`frontend-design`, claude-in-chrome, `ticket-runner`+gh); what remains gstack-provided until teardown is tracked in the gstack-coverage-matrix.
- **superpowers**: the essential skills are now vendored as `harness:*` (`brainstorming`, `writing-plans`, `tdd`, `systematic-debugging`, `verification-before-completion`, plus `ticket-runner`/`ticket-writer`) — prefer the `harness:` version (see the routing table). superpowers stays only for what is not yet vendored (e.g. `writing-skills`, `executing-plans`, `subagent-driven-development`). Document each adaptation in `plans/skill-audits/`.

## Self-evolution principle

The harness improves from real project usage, never auto-applied.

- **Inbound**: while coding in a consumer project, a perceived "the harness should have X" is filed directly as a GitHub issue here (with source-project context), once it clears the agnostic + harness-worthy bar. The tracker is the triage zone; there is no per-project `proposed/` queue and no `feedback push` step.
- **Outbound**: the maintainer CLI `void-harness audit` reports skills not invoked recently, upstream deprecations, repeated matrix conflicts. Proposes deprecations as PRs.
- **HITL is absolute**: no automatic write into doctrine, ever. Every change is a deliberate commit.

## Autonomous mode (opt-in)

`backlog-autopilot` (core skill) is the single, **in-session** backlog drainer. It consolidates the former `backlog-batch` and the deleted `autonomous-backlog-loop` (whose out-of-session `claude -p` lost the in-session MCP / connector / subscription inheritance). A human launches `/harness:backlog-autopilot`; it drains a Linear pool into clean PRs. Stable core today: the **attended, parallel** burst — an in-session launcher selects independent tickets, estimates each ticket's file footprint, routes **parallel where overlap risk is low, sequential where it is high** (lockfile/migrations always sequential), and — after **human confirmation** — runs a deterministic **Workflow** that fans out one **worktree subagent** per ticket, reconciled into **one integration PR** gated by the full suite. The deterministic core (selection, partition, plan) is the CLI `void-harness backlog-autopilot plan`; subagents inherit the parent auth → subscription. Needs the Workflow tool. **In progress** (see `docs/specs/2026-06-21-backlog-autopilot.md` + `plans/2026-06-21-backlog-autopilot-plan.md`): cluster auto-detection (cluster vs batch-of-4), multi-cluster long-run autonomy, and **risk-gated** auto-merge to `develop`/`main`. The per-ticket quality cycle is now the dedicated `harness:ticket-runner` skill (single source of truth) that each worker runs; tickets are authored by `harness:ticket-writer`. Durable boundaries: HITL at backlog curation and PR merge, **commit-only** workers, server-side branch protection required on the base, security hooks live, `--dangerously-skip-permissions` sandbox-gated. A future **headless backend** (walk-away/cron) is reserved and deferred — not the deleted loop. See `docs/DECISIONS.md` (2026-06-18, 2026-06-21).
