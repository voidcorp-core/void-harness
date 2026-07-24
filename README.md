# void-harness

[![npm](https://img.shields.io/npm/v/voidharness?color=0b7285&label=voidharness)](https://www.npmjs.com/package/voidharness)
[![ci](https://github.com/voidcorp-core/void-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/voidcorp-core/void-harness/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/npm-provenance%20signed-0b7285)](https://registry.npmjs.org/-/npm/v1/attestations/voidharness@2.0.2)
[![license](https://img.shields.io/badge/license-MIT-0b7285)](./LICENSE)

> A development-doctrine operating system for coding agents. Multi-runtime by construction, public, MIT.

Install a top-5% development doctrine on any project in one command, run it across several agent runtimes, and read locally what is installed, actually active, and worth improving.

- **Craftsman skills** — TDD strict, TigerStyle, hexagonal, DDD — enforced by hooks, not vibes.
- **Evidence-bound missions** — append-only local proofs, findings and honest verdicts that become stale when their inputs change.
- **Multi-runtime by construction** — one doctrine, compiled locally to **Claude Code** (`CLAUDE.md` + `.claude/skills` + `.claude/agents`) and **Codex** (`AGENTS.md` + `.codex/hooks.json` + `.agents/skills`) through a runtime-adapter seam. Both runtimes get the *same* enforcement: the hooks are a full mirror, and the read-only agents are compiled into Codex skills rather than re-authored. What genuinely cannot cross over is listed in `docs/CODEX.md` instead of being papered over. Add a runtime later without a reinstall (`void-harness runtime add codex`).
- **Pluggable stack packs** — Next.js, monorepo, React, server, PWA, mobile — activated per project.
- **Free and account-free** — `npx voidharness init`. No Claude account, no subscription, no API key. The Claude Code marketplace is an optional secondary channel.

Born at VoidCorp, released for anyone.

## Status

**2.0.2 — live on npm**, public MIT. Install with `npx voidharness init`. Releases are cut
from Conventional Commits and published from CI **tokenlessly** via npm Trusted Publishing
(OIDC) — no npm token exists in this repo or its secrets — and carry a **provenance
attestation** signed by GitHub Actions and recorded in the sigstore transparency log.

Verify it yourself rather than taking this line's word for it:

```bash
npm audit signatures                                     # in a project that installs it
curl https://registry.npmjs.org/-/npm/v1/attestations/voidharness@2.0.2
```

See `docs/RELEASING.md` for the release flow, `plans/` for design specs, and
`docs/DECISIONS.md` for the legacy decision landing page and `void-harness decisions render` for the current projection.

## Philosophy

Three non-negotiables, in order:

1. **Safety** — every line of production code is test-first, every assertion is paired, every boundary is schema-validated
2. **Performance** — back-of-the-envelope sketches before code; mechanical sympathy; batch over react
3. **Developer experience** — fast feedback loops, zero magic, every convention motivated in writing

Inspired by Wing Chun (economy of means), TigerStyle (TigerBeetle), Citypaul dotfiles, and the compound-engineering loop.

> *"Du vide naît la structure"* (VoidCorp motto, kept in French by design) — Build More. Move Fast. Be Better.

## Architecture

```
void-harness/
├── packages/
│   ├── cli/                       # voidharness — the CLI (the only npm package)
│   │   └── core-assets/           # bundled plugin + frozen model/certification (self-contained npx)
│   ├── core/                      # harness plugin (static assets, not an npm package)
│   │   ├── skills/                # craftsman skills
│   │   ├── agents/                # doctrine-critic (read-only doctrine conformance review)
│   │   ├── hooks/                 # tdd-guard, no-any-grep, no-console-log-grep, etc.
│   │   ├── codex/                 # Codex safety-floor manifest (hooks.json)
│   │   └── modules/               # CLAUDE.md modules (composable)
│   ├── mission-engine/            # pure mission/event contracts and reducers
│   ├── hook-runner/               # portable Node hook event writer
│   ├── harness-graph/             # graph kernel + frozen model.json / certification.json
│   └── packs/
│       ├── pack-monorepo/         # Turbo / ADR / 5+5 layout
│       ├── pack-react/            # React 19 component-layer purity
│       ├── pack-nextjs/           # Next.js App Router conventions
│       ├── pack-server/           # backend service conventions
│       ├── pack-pwa/              # installable PWA conventions
│       └── pack-mobile/           # Expo / React Native conventions
├── plans/                         # specs + skill audits
├── test/                          # automated skill + CLI tests
├── docs/                          # PHILOSOPHY / ARCHITECTURE / CODEX / CONTRIBUTING / DECISIONS / RELEASING
└── scripts/                       # bump-version, anti-bloat, copy-core-assets, check-publish-safety
```

## Usage

Install free, account-free (no Claude account, no subscription, no API key), in one command:

```
npx voidharness init
```

> On a pnpm project, prefer `pnpm dlx voidharness init` — `npx` (npm) prints harmless
> "Unknown project config" warnings when it reads your pnpm-only `.npmrc` keys; `pnpm dlx` doesn't.

It detects the project and installed runtimes (Claude Code / Codex), compiles the bundled tarball
into each runtime's native project directories, smokes the staged hooks, then publishes the finite
file set transactionally. `.void/receipts/install-v1.json` records deletion ownership; rollback
restores the previous bytes and adjacent user files are never claimed. No marketplace, `gh`,
GitHub authentication or network fetch is part of the default path.

```
npx voidharness status     # deterministic, offline, LLM-free project health
npx voidharness doctor     # health check
```

For an auditable local execution:

```bash
npx voidharness mission start --title "Ship feature"
npx voidharness mission verify --id mis_<returned-id> -- pnpm test
npx voidharness mission inspect --id mis_<returned-id> --json
npx voidharness mission archive --id mis_<returned-id>
```

Verification runs argv directly with `shell:false`; shell interpretation is
available only through explicit `--shell`. Mission evidence stays under
`.void/runs/`, is redacted and bounded, and compressed archives remain local
under `.void/archives/`.

### Multiple runtimes, added when you need them

The harness is runtime-agnostic by construction: one doctrine, compiled to each agent runtime
through an adapter. `init` wires the runtimes it detects (or `--runtime claude|codex|both`). Each
runtime owns its own layer and doctrine doc — a Claude-only project has just `CLAUDE.md`, a
Codex-only project just `AGENTS.md`.

Add a runtime **later, without friction** — no reinstall, nothing touched on the runtime you
already use:

```
npx voidharness runtime list        # which runtimes are wired
npx voidharness runtime add codex    # wire Codex on a Claude project (or vice-versa)
```

`runtime add codex` stages Codex's safety floor (`.codex/hooks.json` + one portable Node runner) and writes
`AGENTS.md`, leaving your Claude setup byte-for-byte untouched. See [`docs/CODEX.md`](docs/CODEX.md).
`add`, `remove` and `update` reconcile local assets through the same staged transaction; a pack
removal deletes only unchanged files owned by the receipt and preserves adjacent or edited files.

`status` reads a frozen capability certification and local telemetry to show, per capability, the
five-state lifecycle (`available → installed → verified → used → effective`) and a blocker/gauge
score — no model call, no network. See [`docs/DECISIONS.md`](docs/DECISIONS.md) (2026-07-21) for the
public-MIT distribution decision (supersedes the earlier marketplace-only stance).

### Claude Code marketplace (optional, secondary)

Claude-Code users who prefer the plugin channel can still install from the **voidcorp** marketplace:

```
/plugin marketplace add voidcorp-core/void-harness
/plugin install harness@voidcorp
/plugin install harness-nextjs@voidcorp     # add a stack pack
```

Skills then auto-load as `/harness:<name>` (core) and `/harness-<stack>:<name>` (packs). The catalog
is self-hosted here: [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) lists every
plugin as a local subdirectory (`./packages/core`, `./packages/packs/*`), versioned by each
`plugin.json`.

The CLI equivalent is explicit: `void-harness init --source marketplace` (or
`--marketplace`). Local bundled assets remain the default.

### Enforce the floor on every PR (void-enforce Action)

The local hooks (TDD order, no editing secrets/keys/lockfiles, no forbidden
`@repo/*` imports, no leaked tokens, no destructive shell) only run on the machine that
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

It runs protected-path, secret-content, TDD and boundary checks through the
exact portable Node bundle used inline. It reports per-file/line annotations
and **fails closed** — a missing dependency or
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
void-harness self-host sync --mode shadow  # compile this repo as its own consumer
void-harness self-host doctor              # prove receipt, hooks and event replay
```

Self-host artifacts stay under the gitignored `.void/generated/` boundary and
never overwrite the authored core or native root agent configuration.

## Relation to other VoidCorp repos

- [`voidcorp-core/forge`](https://github.com/voidcorp-core/forge) — ideation pipeline plugin, distributed as `forge@voidcorp`.
- [`voidcorp-core/void-plugins`](https://github.com/voidcorp-core/void-plugins) — legacy dedicated catalog; superseded by this repo's self-hosted `.claude-plugin/marketplace.json`. Kept for back-compat with installs that still point at it.
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
