# Contributing

Contributions are welcome. This repo enforces more of its conventions in CI than most, so read this first — it is short, and it will save you a red build.

## Setup

```bash
pnpm install
pnpm test          # 1100+ tests, ~30s
```

Node `>=22.12` (CI and the maintainer environment run 24). pnpm is pinned via `packageManager`; do not pass a `--version` to `pnpm/action-setup`.

## The rules CI actually enforces

These are not style preferences. A PR violating them fails `validate`:

| Rule | Gate |
| --- | --- |
| Skills ≤ 400 lines, hooks ≤ 100 lines, frontmatter `description` ≤ 200 chars | `pnpm anti-bloat:check` |
| `CLAUDE.md` and `AGENTS.md` stay in section parity | `pnpm sync:docs` |
| Every version-carrying manifest at the same version | `pnpm version:check` |
| Decision schemas, links, cycles and accepted-record immutability | `pnpm decisions:check` |
| `packages/cli/core-assets` mirrors `packages/core` | rebuild with `pnpm --filter voidharness build:assets` |
| `model.json` and the embedded consumer bundle current | `pnpm graph:check`, `pnpm graph:check-bundle` |

If you edit anything under `packages/core/`, run:

```bash
pnpm --filter voidharness build:assets
```

and commit the result. Editing a hook also changes its line count, which the graph model records — rebuild it too.

## Conventions that bite

- **Conventional Commits, and the PR title matters.** PRs are squash-merged, so the *PR title* becomes the commit release-please reads. A non-conventional title is silently ignored and your change vanishes from the changelog. This has happened twice; do not make it three.
- **Every commit message ends with *why*, not just *what*.** The git log is documentation.
- **Any non-obvious decision** gets its own collision-free file through `void-harness decisions new`. Never edit an accepted record or `docs/DECISIONS.md`; supersede the record instead.
- **Any new convention** must land in `docs/*.md` in the same commit.
- **TDD is not optional** for logic. Write the failing test first; `tdd-guard` blocks production files without a sibling test.

## Adding a skill

Read `CLAUDE.md` ("Anti-bloat discipline" and "Sourcing discipline") before writing one. In short: one skill, one subject; no more than 30% responsibility overlap with an existing skill; distilled and adapted from its sources, never vendored verbatim; a `.source` sidecar next to it and an audit note in `plans/skill-audits/`.

## Multi-runtime

The harness targets Claude Code **and** Codex through a runtime-adapter seam (`packages/cli/src/lib/runtime-adapters.ts`). Author doctrine once and compile it per runtime; do not add a Claude-only path with a Codex apology. What genuinely cannot cross over is tabled in `docs/CODEX.md` — add to that table rather than letting a capability silently degrade.

## Reporting

Bugs and harness gaps go to [issues](https://github.com/voidcorp-core/void-harness/issues). Security findings go through a [private advisory](https://github.com/voidcorp-core/void-harness/security/advisories/new) instead — see `SECURITY.md`.
