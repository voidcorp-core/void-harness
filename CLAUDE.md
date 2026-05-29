# CLAUDE.md — void-harness

You are working inside the **void-harness** repo itself — the meta-repo that produces the Claude Code harness for every VoidCorp project. This file governs work **on the harness**, not work on projects that consume it.

## What this repo is

A versioned package distributed via npm (`@voidcorp/harness`) that injects opinionated Claude Code configuration into any project:

- **Core** (`packages/core/`) — universal craftsman skills, agents, hooks, CLAUDE.md modules
- **Packs** (`packages/packs/*`) — stack-specific add-ons activated per project
- **CLI** (`packages/cli/`) — install / add / update / doctor commands

## Read before writing

1. `README.md` — vision + target architecture
2. `docs/PHILOSOPHY.md` — three pillars (safety / performance / DX) + sources
3. `docs/ARCHITECTURE.md` — package boundaries + dependency direction
4. `plans/` — current and past design specs

## Anti-usine-à-gaz discipline

Seven hard rules. **Any PR violating these is blocked.**

1. **≤ 400 lines per skill.** No exception. If you need more, split.
2. **One skill = one subject.** A skill that talks about TDD AND mutation testing splits into two.
3. **No responsibility overlap > 30%** between two skills. If detected, fuse or clarify boundary.
4. **Frontmatter `description` ≤ 200 chars**, precise enough that auto-discovery picks the right skill from the description alone.
5. **Hooks ≤ 100 lines**, shell or simple TS. No DSL maison, no framework.
6. **Agents have an explicit scope**. `senior-reviewer` reviews code — it does not also do QA, design, or shipping (those stay in gstack).
7. **Skill tests pass in CI.** A broken skill blocks the release.

## Vendoring discipline

Many core skills are **distilled from external sources** (superpowers, citypaul, TigerStyle, etc.). When vendoring:

- Add an attribution file `.source` next to the skill listing the inspirations
- If the skill is vendored verbatim, mark it `verbatim: <source-url>` and note any minimal stack-agnostic adaptations
- If the skill is improved, document the specific improvements in `plans/skill-audits/<skill-name>.md` (one fiche per skill, see template)
- **Never reinvent without justified improvement.** YAGNI applies hardest here.

## Hard rules for any code added to this repo

- Match file naming exactly per convention (`Name.ts`, `Name.test.ts`, etc.)
- Pure helpers: no I/O, no side effects
- No `console.log` in committed code — use the project logger
- No em dashes, no emojis in code/docs/commits
- Read the official documentation of any third-party tool **before** writing its config
- Conventional commits, every message ends with **why**, not just **what**

## Meta-rules

- Any new convention added in a commit MUST be reflected in `docs/*.md` in the same commit
- Any non-obvious decision (where a credible alternative exists) MUST be logged in `docs/DECISIONS.md`
- Removed concepts must be removed from the docs at the same time
- Tests run via `pnpm test`; do not skip TDD when adding logic

## Skill routing inside this repo

| Task | Skill / Tool |
|---|---|
| Adding a skill | `superpowers:writing-skills` (for now — until we vendor our own) |
| Brainstorming the next feature | `superpowers:brainstorming` (vendored target: `voidcorp:brainstorming`) |
| Writing a plan | `superpowers:writing-plans` (vendored target: `voidcorp:writing-plans`) |
| QA / design / ship | gstack (`/qa`, `/design-review`, `/ship`) |

## On gstack and superpowers

- **gstack** is and stays installed globally (`~/.claude/skills/gstack/`). It covers QA, design, browser, ship. The harness does **not** reinvent these workflows.
- **superpowers** will be uninstalled from global once the harness vendors its essential skills (`brainstorming`, `writing-plans`, `systematic-debugging`, `verification-before-completion`, `test-driven-development`). Until then, prefer the superpowers version and document the migration in `plans/skill-audits/`.
