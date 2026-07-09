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
- The maintainer CLI command `void-harness init` (and `add` / `remove`) patches both files in consumer projects, keeping them in parity. It does not install the harness's own pre-commit hook into the consumer — the parity gate is a harness-repo concern; a consumer that wants it opts in by pointing `core.hooksPath` at the shipped `.githooks/`.

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

### Hook libraries (`_`-prefixed)

Hooks are one file each and capped at 100 LOC (anti-bloat rule 5). Shared hook
logic lives in an **underscore-prefixed sourced library** (`core/hooks/_hooklib.sh`),
never executed on its own and excluded from the per-hook size cap. `_hooklib.sh`
carries the single guarded stdin parse: it reads the Claude Code / Codex tool-call
JSON once, extracts scalars with a pure-bash fallback, and — critically — **fails
closed** when `jq` is absent (a content-scanning hook blocks with an explicit
message instead of exiting 127, which the runtime treats as non-blocking and which
silently disabled the whole enforcement layer before). It also owns the physical
root-relative path normalization the enforcement globs depend on. A hook sources it
with `source "${BASH_SOURCE[0]%/*}/_hooklib.sh"`; `activation-meter.sh` (already
self-guarded, non-blocking) and `sessionstart-context.sh` (not a tool-call parser)
are the two deliberate non-consumers.

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

## Inter-plugin contracts (the core-hub model)

The core plugin is **always installed** and acts as the hub between plugins. A sibling plugin (today: `forge`, the ideation pipeline) routes into the core's execution capabilities (`brainstorming`, `writing-plans`, `ticket-writer`, `tdd`, ...) rather than reimplementing them or dangling a pointer at a gstack skill. The nominal routing assumes the core is present; the coupling is nonetheless a **versioned artifact contract**, not a hard plugin dependency, so each plugin still makes sense alone — forge degrades to producing a standalone spec, core works with a hand-written spec.

Re-splitting core into `core` + `dev` (execution) sub-plugins is explicitly **deferred (YAGNI)**: one core-hub is enough until a second consumer of the "execution" half exists.

### The forge → harness spec contract

The interface is a markdown spec the harness **owns the format of**, dropped by forge (or a human) at `docs/specs/YYYY-MM-DD-<slug>.md`. Frontmatter marks provenance and the recon summary:

```yaml
---
source: forge # provenance; core skills ingest instead of re-asking
forge_version: "0.2.0" # contract version, for tolerance on older specs
slug: <kebab-slug> # disambiguates two specs in one repo
verdict: GO | GO_PRUDENT | NO_GO # forge:recon critique verdict
score: 0-100 # recon composite score
red_ocean_score: 1-10 # differentiation aggressiveness driver
---
```

The body carries the **18 load-bearing recon variables** (the interface's payload), the **winning design** (chosen `forge:design-prompt` variant), and the **critique verdict** (`forge:critique` findings). The 18 variables, named:

- **Business (10)**: `positioning_statement`, `primary_persona` (`.title` + `.context`), `pain_severity`, `current_solution`, `top_buying_objections`, `competitive_advantage`, `main_competitors`, `price_point` (+ `pricing_justification`), `primary_kpi`, `decision_timeline`.
- **Visual identity (8)**: `emotional_promise`, `brand_archetype`, `signature_moment`, `motion_personality`, `density_target`, `aesthetic_axes`, `inspiration_refs`, `vocab_pro` (+ `vocab_banned`).

**Ingestion rule** (core skills): when a `source: forge` spec exists, **verify and fill the gaps — never re-ask what it already answers**. A partial spec (recon without critique, or a missing field from an older `forge_version`) is ingested for what it has, with the missing pieces listed as the only open questions. Two specs in one repo are disambiguated by `slug` / date.

`brainstorming`, `writing-plans`, and `ticket-writer` each honor this rule (see their SKILL.md "Ingesting a forge spec" note). The forge side of the contract lives in `voidcorp-core/forge` (forge#4).

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

## Telemetry: the cost/value ledger (`.void/*.jsonl`)

Two universal meters, both best-effort (never block, always exit 0), both privacy-scoped to
names/kinds/status only — never file content, output, or secrets:

- **attempts** — `activation-meter.sh` (PreToolUse, matcher `*`) appends one event per tool call
  to `.void/activations.jsonl`: `{ ts, kind, name, trigger, sessionId }`. The single source of
  truth for what fired (issue #70); `void-harness audit` and the graph cost/behavior kernels read
  it.
- **outcomes** — `outcome-meter.sh` (PostToolUse `*` + Stop) appends completions to
  `.void/outcomes.jsonl`: `{ ts, event, kind, name, status, sessionId }` for a finished tool call
  (status best-effort from `tool_response`) and `{ event: "Stop", sessionId }` when a session ends
  cleanly (issue #71). This is the **value** side: `analyzeCost` joins it per component (by kind +
  bare name) so `graph cost` shows a `yield` column (ok/(ok+error)) next to the token cost. A
  session with no Stop (interrupted) leaves its attempts uncounted as failures — orphan attempts
  are not errors.

The two files never disagree because each has exactly one writer, and cost/value are correlated by
`sessionId`. Cross-project aggregation and opt-in finding push ride on top of these files (issue
#72), and are deliberately out of the meters themselves.

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
| Anti-bloat: hook size | fails if any `hooks/*.sh` (excluding `_`-prefixed libs) exceeds 100 LOC |
| Shell syntax | `bash -n` on every hook |
| Manifest ↔ disk | fails if `plugin.json` wires a `hooks/<name>.sh` that does not exist on disk |
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
