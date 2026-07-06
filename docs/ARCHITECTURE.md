# Architecture

## Topology

```
void-harness/
├── packages/
│   ├── cli/                       # @voidcorp/harness
│   │   ├── src/commands/          # install, add, update, doctor, init
│   │   └── package.json
│   ├── core/                      # harness plugin (static assets, not an npm package)
│   │   ├── .claude-plugin/        # plugin.json — wires hooks, declares the plugin
│   │   ├── modules/               # 01-philosophy.md, 02-tdd.md, 03-tigerstyle.md...
│   │   ├── skills/                # craftsman skills (TDD, refactor, hexagonal, ...)
│   │   ├── agents/                # doctrine-critic (read-only doctrine conformance review)
│   │   └── hooks/                 # tdd-guard.sh, no-any-grep.sh, no-console-log-grep.sh
│   └── packs/                     # one workspace + plugin per capability
│       ├── pack-monorepo/         # @voidcorp/pack-monorepo  (plugin harness-monorepo)
│       ├── pack-react/            # @voidcorp/pack-react      (plugin harness-react)
│       ├── pack-nextjs/           # @voidcorp/pack-nextjs     (plugin harness-nextjs)
│       ├── pack-server/           # @voidcorp/pack-server     (plugin harness-server)
│       ├── pack-pwa/              # @voidcorp/pack-pwa        (plugin harness-pwa)
│       └── pack-mobile/           # @voidcorp/pack-mobile     (plugin harness-mobile)
├── apps/                          # private, unpublished surfaces (graph-studio)
├── plans/                         # specs + ADRs of the harness itself
│   └── skill-audits/              # one audit note per vendored skill
├── test/                          # automated skill tests (citypaul-style)
└── docs/                          # PHILOSOPHY, ARCHITECTURE, DECISIONS, RELEASING
```

## Stack baseline

The harness assumes **TypeScript + web**. The core is not framework-agnostic across language families. See `docs/PHILOSOPHY.md` § "Stack assumption".

A future Rust/Go/Python flavor lives in a sibling repo, reusing mechanics not skills.

## Agent runtime parity (Claude Code + Codex)

The harness targets two primary agent runtimes simultaneously: **Claude Code** (via `CLAUDE.md`) and **Codex CLI** (via `AGENTS.md`). Both files coexist at every level where one would: the repo root, each pack root, and every consumer project.

Rules:

- Doctrine in `CLAUDE.md` and `AGENTS.md` is identical. Only terminology adapts ("Claude Code" / "Skill tool" vs "Codex" / "tools / shell").
- `scripts/sync-agent-docs.sh` enforces parity on the harness repo itself: `--staged` (a commit touching one sister doc must touch the other) via `.githooks/pre-commit` (`git config core.hooksPath .githooks`), and section-heading parity in CI (`pnpm sync:docs`).
- No file is auto-generated from the other. Auto-generation risks losing intentional adaptations. Manual authoring + mechanical gate is the safer trade-off.
- The CLI command `npx @voidcorp/harness init` (and `add` / `remove`) patches both files in consumer projects, keeping them in parity. It does not install the harness's own pre-commit hook into the consumer — the parity gate is a harness-repo concern; a consumer that wants it opts in by pointing `core.hooksPath` at the shipped `.githooks/`.

## Agent model tiers

Every agent declares an explicit `model:` in its frontmatter, chosen by the work's leverage, not by default. The tiering (distilled from `wshobson/agents`):

| Tier | Use for |
|---|---|
| **opus** | Architecture, security, critical review, production-coding — high-leverage work where a wrong call cascades |
| **sonnet** | Documentation, test authoring, debugging, codebase exploration — substantial but bounded reasoning |
| **haiku** | Mechanical, fast ops — formatting, simple lookups, deterministic transforms |
| **inherit** | Work whose complexity varies run to run; let the calling session's model carry through |

**Rule**: any new agent MUST declare an explicit `model:` per this tiering. The existing `doctrine-critic` agent (read-only doctrine conformance) is the canonical example: it runs on `sonnet`.

## Boundary principles

### Core vs Packs

| Concern | Where |
|---|---|
| TypeScript + web craftsman discipline (universal within that stack) | `core/` |
| Process skills (brainstorming, planning, debugging) | `core/` |
| Hooks that enforce universals | `core/hooks/` |
| Framework-specific patterns (Next.js, React Native, etc.) | `packs/<pack>/` |
| Framework-specific extensions of core skills | `packs/<pack>/` (can extend, not override blindly) |
| Package-manager / monorepo-tool specifics (Bun, Turbo, pnpm) | `packs/pack-monorepo/` |

**Rule**: a file in `core/` may assume TypeScript, Zod, `tsc`, vitest-style discovery. It may NOT assume a specific framework (Next vs Remix vs SvelteKit), a specific runtime (Node vs Bun vs Deno), or specific monorepo tooling. Those decisions live in packs and are read from `voidcorp.config.json` at runtime.

### Pack independence

Two packs **may not depend on each other**. If pack A and pack B share logic, that logic belongs in `core/`.

### CLI scope

The CLI is the only entry point. It:

1. Installs core into `~/.claude/voidcorp/`
2. Adds packs to the current project's `.claude/` (via symlink or copy)
3. Updates both
4. Runs `doctor` to detect drift / corruption / version mismatch
5. Runs `init` to create `voidcorp.config.json` in a new project

The CLI does **not** edit the consumer's source code. The consumer's CLAUDE.md imports harness modules — the harness never writes business code.

## Dependency direction

```
cli  →  core  ←  packs
```

- `cli` depends on `core` (for the install logic, version manifest)
- `packs` depend on `core` (for shared modules / skills they extend)
- `core` depends on nothing inside the repo

## apps/ (surfaces)

`apps/*` are private, unpublished surfaces that consume the packages. They may
depend on `packages/*` (e.g. `apps/graph-studio` devDepends on
`@voidcorp/harness-graph`), never the reverse. They are exempt from the 400-line
skill cap (they are apps, not skills) and from version lockstep (private, not
shipped). `apps/graph-studio` is the maintainer 3D view of the component graph
(spec §7): a Node prebuild runs the kernel's `analyze()` into static JSON, and the
browser bundle is a pure renderer of that JSON (functional core / imperative shell,
the same split the kernel uses).

## Consumer graph delivery (`/void-graph`)

The graph tooling also ships to consumers, not just the monorepo. A build step
(`packages/cli/scripts/build-void-graph.ts`) bundles the kernel + `graph` CLI into one
self-contained `packages/core/graph/void-graph.mjs`: `model.json` is baked in via the
`__VOID_BUNDLED_MODEL__` esbuild define, and the single-file vite studio is inlined via
`__VOID_BUNDLED_STUDIO__`. The marketplace ships `packages/core` directly, so the artifact
reaches consumers with zero npm publish. The `/void-graph` command runs it from
`${CLAUDE_PLUGIN_ROOT}/graph/void-graph.mjs`.

On a consumer the CLI runs in **bundled mode**: it loads the baked model instead of scanning a
source tree (no monorepo paths), filters it to the packs enabled in `.claude/settings.json`, and
correlates it with local telemetry (`.void/activations.jsonl`, transcripts). `graph live` serves
the inlined studio and a `/studio-data.json` endpoint on `localhost` — fully offline. Freshness
is gated by `graph check-bundle` (the artifact's embedded model must match `model.json`); see
DECISIONS.md (2026-07-01). The artifact is excluded from the `core-assets` mirror.

## Node frontmatter: `activation` (graph liveness)

A skill's SKILL.md frontmatter may declare `activation: always` or `activation: on-demand`
(absent = `on-demand`, the default). It tells the graph cost/behavior kernels how the node
earns its place:

- `always` — doctrine followed **passively**: its rule applies via `@.void/PHILOSOPHY.md`
  and enforcing hooks, never invoked through the Skill tool, so `invocations: 0` is expected,
  not a death signal. Exempt from `dead` / `underused` / `low-yield`, marked with the positive
  `always` flag (still eligible for `expensive`). Granted only on **auditable backing**: the
  skill is the target of an `enforces` edge, or its principle is stated in `PHILOSOPHY.md`.
  16 skills qualify.
- `on-demand` — a workflow triggered **actively** (brainstorming, writing-plans, ticket-*,
  backlog-autopilot, ...), or a conditional skill with no structural backing (async-safety,
  api-and-interface-design, ...). If never invoked, a low count is a real signal — historical
  behavior.

The predicate is "is `invocations: 0` a death signal for this node?" — answered by structural
proof, not taste. See DECISIONS.md (2026-07-04) for the 16/15 partition, the two accepted proofs
of backing, and why the mode is declared explicitly rather than inferred.

## .void/config.json (consumer-side)

Generated by `void-harness init`. Lives at `.void/config.json` in the consumer project.

The `packs` field pins the **marketplace plugins** that were enabled, keyed
`@voidcorp/<plugin-name>` (the plugin name, e.g. `harness-nextjs`, scoped under
`@voidcorp/`), each mapped to the version it was pinned at. These are plugin
references, not npm package names: the npm packages are `@voidcorp/pack-<stack>`,
the plugins they pair with are `void-<stack>`. `doctor` reads this field to
detect version drift against the marketplace HEAD.

```json
{
  "core": "^0.5.4",
  "packs": {
    "@voidcorp/harness-nextjs": "^0.5.4",
    "@voidcorp/harness-monorepo": "^0.5.4"
  },
  "stack": {
    "packageManager": "bun",
    "testRunner": "vitest",
    "e2eRunner": "playwright"
  },
  "paths": {
    "src": "apps/*/src/**",
    "tests": "apps/*/src/**/*.test.{ts,tsx}",
    "spikes": "apps/*/scripts/spike-*"
  },
  "modes": {
    "tdd": "auto"
  }
}
```

Skills and hooks read this file to adapt to the consumer's conventions without hardcoding.

## Versioning

Lockstep: one number governs the CLI, the runtime npm packages, and the
marketplace plugins. Bumped with `scripts/bump-version.mjs` (see RELEASING.md).
Changesets were removed in v0.5.4 because independent per-package versions
contradict the lockstep model.

- **patch**: bug fix in a skill / hook, documentation, attribution updates
- **minor**: new skill, new hook, new pack
- **major** (or any pre-1.0 minor): breaking change in a skill's contract (renamed front-matter, removed flag), CLI interface change, restructured `.void/config.json`

Every package shares the same number. The CLI displays the active version on `doctor`.

## CI gates

Implemented today in `.github/workflows/ci.yml` (all block the PR on failure):

| Gate | What it runs |
|---|---|
| Anti-bloat: SKILL.md size | fails if any `SKILL.md` exceeds 400 LOC |
| Anti-bloat: hook size | fails if any `hooks/*.sh` exceeds 100 LOC |
| Shell syntax | `bash -n` on every hook |
| core-assets sync | regenerates `core-assets` and fails if it drifted from `packages/core` |
| Publish safety | packs each npm package with pnpm and fails if a `workspace:` specifier survives into the tarball |
| Lint | `pnpm lint` (Biome) over first-party TypeScript |
| Build | `pnpm build` (packs must build before typecheck resolves their exports) |
| Graph integrity | `pnpm graph:check` — model.json drift + broken routes |
| Consumer bundle freshness | `pnpm graph:check-bundle` — the shipped `void-graph.mjs` embeds the current `model.json` |
| Skill tests | `pnpm vitest run` |
| Typecheck | `pnpm -r typecheck` |

Roadmap (documented intent, not yet wired): skill front-matter schema check,
per-hook smoke tests on a sample repo, CLI integration tests on a fresh fixture.
Releases are cut with `scripts/bump-version.mjs` (lockstep), not changesets; the
`.changeset/` directory is unused.
