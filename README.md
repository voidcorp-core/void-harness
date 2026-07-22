# void-harness

> Production-grade agent harness (Claude Code + Codex) for **VoidCorp**.

A pluggable agent configuration that brings every new project to the top 5% bar — **automatically**.

Core craftsman skills (TDD strict, TigerStyle, hexagonal, DDD), enforced by hooks. Pluggable stack packs (Next.js PWA, monorepo, mobile). Public and MIT: installed free and account-free via `npx @voidfactory/harness`, with the Claude Code marketplace as an optional secondary channel.

The opinionated foundation every VoidCorp project inherits.

## Status

**Phase**: active — public MIT, installed via `npx @voidfactory/harness` (current version in the
manifests). See `plans/` for design specs and `docs/DECISIONS.md` for the decision log.

## Philosophy

Three non-negotiables, in order:

1. **Safety** — every line of production code is test-first, every assertion is paired, every boundary is schema-validated
2. **Performance** — back-of-the-envelope sketches before code; mechanical sympathy; batch over react
3. **Developer experience** — fast feedback loops, zero magic, every convention motivated in writing

Inspired by Wing Chun (economy of means), TigerStyle (TigerBeetle), Citypaul dotfiles, and the compound-engineering loop.

> *"Du vide naît la structure"* (VoidCorp motto, kept in French by design) — Build More. Move Fast. Be Better.

## Architecture (target)

```
void-harness/
├── packages/
│   ├── cli/                       # @voidfactory/harness — CLI npm
│   ├── core/                      # harness plugin (static assets, not an npm package)
│   │   ├── skills/                # craftsman skills
│   │   ├── agents/                # doctrine-critic (read-only doctrine conformance review)
│   │   ├── hooks/                 # tdd-guard, no-any-grep, no-console-log-grep, etc.
│   │   └── modules/               # CLAUDE.md modules (composable)
│   └── packs/
│       ├── pack-monorepo/         # Turbo / Bun / ADR / 5+5 layout
│       ├── pack-react/            # React 19 component-layer purity
│       ├── pack-nextjs/           # Next.js App Router conventions
│       ├── pack-server/           # backend service conventions
│       ├── pack-pwa/              # installable PWA conventions
│       └── pack-mobile/           # Expo / React Native conventions
├── plans/                         # specs + skill audits
├── test/                          # automated skill tests
├── docs/                          # PHILOSOPHY / ARCHITECTURE / CONTRIBUTING / DECISIONS / RELEASING
└── scripts/                       # bump-version, anti-bloat, copy-core-assets
```

## Usage

Install free, account-free (no Claude account, no subscription, no API key), in one command:

```
npx @voidfactory/harness init
```

It detects the project and installed runtimes (Claude Code / Codex), installs the adapted assets,
verifies them, and writes the project state. Then, at any time:

```
npx @voidfactory/harness status     # deterministic, offline, LLM-free project health
npx @voidfactory/harness doctor     # health check
```

`status` reads a frozen capability certification and local telemetry to show, per capability, the
five-state lifecycle (`available → installed → verified → used → effective`) and a blocker/gauge
score — no model call, no network. See [`docs/DECISIONS.md`](docs/DECISIONS.md) (2026-07-21) for the
public-MIT distribution decision (supersedes the earlier marketplace-only stance).

### Claude Code marketplace (optional, secondary)

Claude-Code users who prefer the plugin channel can still install from the **voidcorp** marketplace:

```
/plugin marketplace add voidcorp-core/void-plugins
/plugin install harness@voidcorp
/plugin install harness-nextjs@voidcorp     # add a stack pack
```

Skills then auto-load as `/harness:<name>` (core) and `/harness-<stack>:<name>` (packs). The catalog
lives in [`voidcorp-core/void-plugins`](https://github.com/voidcorp-core/void-plugins) (pinned by
commit sha).

### Enforce the floor on every PR (void-enforce Action)

The local hooks (no editing secrets/keys/lockfiles, no forbidden `@repo/*`
imports, no leaked tokens, no destructive shell) only run on the machine that
has the plugin. To make the same floor incontournable server-side — for cloud
agents, `--dangerously-skip-permissions` runs, or any author — add the reusable
workflow to your repo. Five lines, `.github/workflows/void-enforce.yml`:

```yaml
name: void-enforce
on: pull_request
jobs:
  enforce:
    uses: voidcorp-core/void-harness/.github/workflows/enforce.yml@main
```

It replays the exact `_checks.sh` detection the hooks use (one source of truth),
reports per-file/line annotations, and **fails closed** — a missing dependency or
unresolvable base is a red check, never a silent pass. Pin `@main` to a release
tag for a stable floor. It enforces the doctrine floor only; keep your own
lint/test CI. `void-harness doctor` reports (advisory) whether it is adopted.

### CLI (from a checkout, for contributors)

The `void-harness` CLI is the consumer entry point (via `npx`, above): it wires config per-project
(`.void/config.json`, CLAUDE.md / AGENTS.md patches), reports project state (`status`), and
health-checks a setup (`doctor`). Contributors run it from a checkout of this repo:

```bash
pnpm build && pnpm link --global        # once, exposes `void-harness` on PATH
void-harness init --pack nextjs --pack monorepo   # wire the current project
void-harness status                     # deterministic project health
void-harness doctor                     # health check
```

## Relation to other VoidCorp repos

- [`voidcorp-core/void-plugins`](https://github.com/voidcorp-core/void-plugins) — the voidcorp marketplace catalog (harness, packs, forge).
- [`voidcorp-core/forge`](https://github.com/voidcorp-core/forge) — ideation pipeline plugin, distributed as `forge@voidcorp`.
- [`voidcorp-core/void-starter`](https://github.com/voidcorp-core/void-starter) — Next.js template. Its CLAUDE.md will reference `@voidcorp/pack-nextjs` + `@voidcorp/pack-monorepo`.
- [`voidcorp-core/voidcorp`](https://github.com/voidcorp-core/voidcorp) — marketing site, will use `@voidcorp/pack-marketing-site` (future).

## Anti-bloat discipline

Seven hard rules enforced on every PR (see the "Anti-bloat discipline" section of `CLAUDE.md`):

1. Each skill ≤ 400 lines
2. One skill = one subject (split if two)
3. No duplication of responsibility between skills (>30% overlap → fusion or boundary clarification)
4. Frontmatter `description` ≤ 200 chars, precise enough for auto-discovery
5. Hooks ≤ 100 lines, shell or simple TS — no maison DSL
6. Agents with explicit scope, no spillover into adjacent concerns (QA stays in gstack)
7. Skill tests in CI gate the release

## License

MIT — see `LICENSE`.

Crafted by Folpe @ VoidCorp.
