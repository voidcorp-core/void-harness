# void-harness

> Production-grade agent harness (Claude Code + Codex) for **VoidCorp**.

A pluggable agent configuration that brings every new project to the top 5% bar — **automatically**.

Core craftsman skills (TDD strict, TigerStyle, hexagonal, DDD), enforced by hooks. Pluggable stack packs (Next.js PWA, monorepo, mobile). Distributed as a marketplace plugin (`voidcorp-core/void-plugins`); npm publish is deliberately not wired.

The opinionated foundation every VoidCorp project inherits.

## Status

**Phase**: active — shipping via marketplace (current version in the manifests). See `plans/` for
design specs and `docs/DECISIONS.md` for the decision log.

This repo is private during incubation. Public release planned once MVP stabilizes.

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
│   ├── cli/                       # @voidcorp/harness — CLI npm
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

Distribution is **marketplace-only**: the plugins ship through Claude Code's
marketplace, and the `@voidcorp/harness` npm package is deliberately not
published (see [`docs/DECISIONS.md`](docs/DECISIONS.md)). Consumers install the
plugin from the marketplace; the `void-harness` CLI is maintainer tooling that
lives in this repo.

Install the core plugin (and any pack) from the **voidcorp** marketplace:

```
/plugin marketplace add voidcorp-core/void-plugins
/plugin install harness@voidcorp
/plugin install harness-nextjs@voidcorp     # add a stack pack
```

Skills then auto-load as `/harness:<name>` (core) and `/harness-<stack>:<name>`
(packs). The catalog lives in
[`voidcorp-core/void-plugins`](https://github.com/voidcorp-core/void-plugins)
(pure catalog, pinned by commit sha).

### Maintainer CLI (this repo)

The `void-harness` CLI wires config per-project (`.void/config.json`, CLAUDE.md /
AGENTS.md patches) and health-checks a setup. It is run from a checkout of this
repo, not fetched from npm:

```bash
pnpm build && pnpm link --global        # once, exposes `void-harness` on PATH
void-harness init --pack nextjs --pack monorepo   # wire the current project
void-harness doctor                     # health check
void-harness update                     # sync marketplace pins to remote HEAD
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
