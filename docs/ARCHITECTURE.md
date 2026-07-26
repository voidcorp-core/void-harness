# Architecture

## Topology

```
void-harness/
├── packages/
│   ├── cli/                       # voidharness
│   │   ├── src/commands/          # install, add, update, doctor, init
│   │   └── package.json
│   ├── core/                      # harness plugin (static assets, not an npm package)
│   │   ├── .claude-plugin/        # plugin.json — wires hooks, declares the plugin
│   │   ├── modules/               # 01-philosophy.md, 02-tdd.md, 03-tigerstyle.md...
│   │   ├── skills/                # craftsman skills (TDD, refactor, hexagonal, ...)
│   │   ├── agents/                # doctrine-critic and peers + generated specialist agents
│   │   ├── specialists/           # canonical, runtime-neutral specialist YAML
│   │   └── hooks/                 # tdd-guard.sh, no-any-grep.sh, no-console-log-grep.sh
│   ├── mission-engine/            # pure event/evidence contracts and verdict reducers
│   ├── hook-runner/               # Node adapter compiled into the portable hook asset
│   ├── harness-graph/             # graph kernel + telemetry projections
│   └── packs/                     # one workspace + plugin per capability
│       ├── pack-monorepo/         # @voidcorp/pack-monorepo  (plugin harness-monorepo)
│       ├── pack-react/            # @voidcorp/pack-react      (plugin harness-react)
│       ├── pack-nextjs/           # @voidcorp/pack-nextjs     (plugin harness-nextjs)
│       ├── pack-server/           # @voidcorp/pack-server     (plugin harness-server)
│       ├── pack-pwa/              # @voidcorp/pack-pwa        (plugin harness-pwa)
│       └── pack-mobile/           # @voidcorp/pack-mobile     (plugin harness-mobile)
├── apps/                          # private, unpublished tooling
│   ├── graph-studio/              # the graph visualiser (Vite)
│   └── eval-harness/              # @voidcorp/eval-harness — behavioral skill evals
├── plans/                         # specs and implementation plans
│   └── skill-audits/              # one audit note per vendored skill
├── test/                          # automated skill tests (citypaul-style)
└── docs/                          # doctrine, architecture, release and decisions
    └── decisions-log/             # one immutable, collision-free file per ADR
```

## Decision records

ADRs are an append-only data model, not a generated document:

- `void-harness decisions new` creates one exclusively-owned file with a UUID
  identity; concurrent workers never allocate a shared counter or index.
- `void-harness decisions check` validates the schema, unique identities,
  supersession links and cycles. In CI, `DECISIONS_BASE` also rejects edits,
  renames or deletions of accepted records.
- Decision loading is root-confined, rejects symlinks and bounds each record to
  256 KiB before parsing.
- `void-harness decisions render --format markdown|json` produces a read-only
  projection on stdout. It never commits or rewrites a shared artifact.
- `docs/DECISIONS.md` is only the frozen pre-v3 landing page. Existing repos keep
  their detected ADR directory; new consumer projects default to
  `docs/decisions/`.

The public contract is plain Markdown plus YAML frontmatter, so it works without
an agent runtime. The CLI is deterministic validation and ergonomics, not a
storage dependency.

## Stack baseline

The harness assumes **TypeScript + web**. The core is not framework-agnostic across language families. See `docs/PHILOSOPHY.md` § "Stack assumption".

A future Rust/Go/Python flavor lives in a sibling repo, reusing mechanics not skills.

## Agent runtime parity (Claude Code + Codex) — the adapter seam

The harness authors **one doctrine** and compiles it to each agent runtime through a **runtime adapter** (`packages/cli/src/lib/runtime-adapters.ts`). Today: **Claude Code** (via `CLAUDE.md` + native `.claude/skills`, `.claude/agents` and project hooks) and **Codex CLI** (via `AGENTS.md` + `.agents/skills`, native `.codex/agents` and a `.codex/` safety floor). The npm tarball is the default source; the Claude marketplace is an explicit secondary adapter. This is the *agent-runtime* axis; the orthogonal *model-provider* axis (Anthropic / OpenAI-compatible / Ollama / custom) is a separate seam and is deliberately not conflated.

The seam is the load-bearing rule: **core commands never branch on a runtime name.** `init`, `runtime add`, `doctor`, and `status` iterate the adapters. Adding a runtime (Codex exec, Hermes, a local agent) is a new adapter object registered in `ADAPTERS`, with zero edits to the commands. Each adapter owns exactly its runtime-specific surface: `detect`, `prerequisites`, `wire` (its active layer + **its own** doctrine doc), `inspect` (executable postconditions), and `doctorChecks`.

Rules:

- Doctrine in `CLAUDE.md` and `AGENTS.md` is identical. Only terminology adapts ("Claude Code" / "Skill tool" vs "Codex" / "tools / shell").
- `scripts/sync-agent-docs.sh` enforces parity on the harness repo itself: `--staged` (a commit touching one sister doc must touch the other) via `.githooks/pre-commit` (`git config core.hooksPath .githooks`), and section-heading parity in CI (`pnpm sync:docs`). This is a **harness-repo** rule; a consumer project only carries the doc(s) of the runtime(s) it wired.
- No file is auto-generated from the other. Auto-generation risks losing intentional adaptations. Manual authoring + mechanical gate is the safer trade-off.
- **Doc ownership is per-runtime.** Each adapter's `wire` writes only its own doctrine doc — a Claude-only project has just `CLAUDE.md`, a Codex-only project just `AGENTS.md`. `doctor` checks only the docs of *detected* runtimes, so a Codex-only project is never dinged for a missing `CLAUDE.md`. (`add` / `remove` still patch whichever docs exist, keeping active docs current.)
- **`init` wires each selected runtime's layer via its adapter**, gated by `--runtime <claude|codex|both>` (default: auto-detected footprint, else both). Claude receives native project-local skills, agents, commands and hooks; Codex receives `.agents/skills`, native `.codex/agents` and `.codex/hooks.json`. The package is bundled with all CLI runtime dependencies, so a tarball installs offline. `--source marketplace` is opt-in and is the only path that checks `gh`/marketplace access.
- **Publication is transactional.** `init` seeds only shared merge targets into an isolated stage, compiles and executes each selected adapter's doctor smoke there, then atomically publishes a finite mutation set. Every target is snapshotted before the first write; a failure restores bytes and modes and removes only transaction-created paths. `.void/receipts/install-v1.json` hashes files the install created or already owned. Unowned native conflicts fail unless `--force`, and even force never grants deletion ownership over a pre-existing file.
- **Runtimes are added a posteriori without friction**: `void-harness runtime add <runtime>` wires exactly that runtime's layer on an already-`init`-ed project, touching nothing the other runtime owns (verified byte-for-byte in tests). `runtime list` shows which are wired. This is the `void runtime add` command from the multi-runtime spec.
- **Pack and update lifecycle uses the same transaction.** Local `add`/`remove` compile the exact
  config pack set and prune only unchanged receipt-owned stale assets. Local `update` recompiles
  from the running CLI without a remote fetch. Legacy/explicit marketplace receipts retain their
  cache and remote-pin adapter.
- `doctor` iterates the *detected* adapters for each runtime's wiring + doc health; Claude marketplace checks (`gh`, plugin cache, remote versions) apply only to an explicit marketplace install. Adapter inspection distinguishes `installed`, `wired`, `fired`, and `observed`. The `fired` postcondition executes the installed Node runner against an isolated fixture and reads back its canonical event; a zero exit without that event stays red. In the source repository, `doctor` delegates to the self-host receipt and current-source checks instead of applying consumer assumptions. See `docs/CODEX.md`.

### Source self-host boundary

`void-harness self-host sync` is the only supported dogfood compiler for this
meta-repository. It hashes bounded, symlink-free current inputs, builds the hook
runner and a disposable runtime-adapter worker directly from TypeScript, then
wires `.void/generated/.staging-*` through that current-source worker. The
source set is hashed again before publication; concurrent drift aborts.
Publication swaps the complete directory to `.void/generated/current`; a
failed swap restores the last green artifact.

The deterministic receipt records the source hash, rollout mode and every owned
file's bytes + mode. An identical sync is a no-op. `self-host doctor` separately
reports source staleness, artifact drift, discovery, adapter hook smoke,
canonical event replay and native runtime availability. Missing runtime CLIs are
degraded, never certified or silently green.

Doctor probes receive a minimal portable child environment plus their explicit
`VOID_*` contract. Provider credentials, registry tokens, home paths and other
ambient configuration never cross that process boundary.

This boundary never writes `packages/core/`, root `CLAUDE.md`/`AGENTS.md`, or
root `.claude`/`.codex`/`.agents` surfaces. All generated files and runtime probe
metadata are gitignored. Modes `shadow` and `warn` are advisory; `enforce` and
`release-gate` fail on structural blockers.

## Agent model tiers

Authored legacy agents declare an explicit `model:` in their Claude frontmatter, chosen by the work's leverage, not by default. Canonical specialists deliberately omit a model: both compilers inherit the selected parent runtime model so the provider-neutral contract cannot pin a provider-specific tier. The tiering (distilled from `wshobson/agents`):

| Tier | Use for |
|---|---|
| **opus** | Architecture, security, critical review, production-coding — high-leverage work where a wrong call cascades |
| **sonnet** | Documentation, test authoring, debugging, codebase exploration — substantial but bounded reasoning |
| **haiku** | Mechanical, fast ops — formatting, simple lookups, deterministic transforms |
| **inherit** | Work whose complexity varies run to run; let the calling session's model carry through |

**Rule**: a new authored runtime-specific agent MUST declare an explicit `model:` per this tiering. A new cross-runtime specialist MUST instead inherit and put its hard limits in the canonical budget. The existing `doctrine-critic` is the authored-agent example; `solution-architect` is the canonical-specialist example.

## Native specialist contracts

Architecture, security, and QA live under `packages/core/specialists/*.yaml`. The strict loader
bounds files, disables YAML aliases, rejects unknown keys and duplicate identities, then each
runtime compiler embeds the same instructions and structured result schema. Claude receives
`.claude/agents/*.md`; Codex receives `.codex/agents/*.toml`. The five older Markdown critics also
compile to native Codex TOML, so no agent is represented as an inline skill.

The Claude marketplace needs discoverable `agents/*.md` in the source tree. Those three files are
generated artifacts, not a second doctrine source: tests compare them byte-for-byte with the YAML
compiler. Installed files are receipt-owned and updated transactionally.

Both adapters report specialist team mode as degraded today. Claude can remove mutating built-ins
but agent frontmatter cannot deny unknown inherited MCP tools; Codex declares `sandbox_mode =
"read-only"`, disables web search and MCP servers, but the parent turn can override its sandbox and
Codex has no per-agent process allowlist. Discovery remains useful; orchestration may not claim
enforced isolation until a runtime probe proves it.

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

**Rule**: a file in `core/` may assume TypeScript, Zod, `tsc`, vitest-style discovery. It may NOT assume a specific framework (Next vs Remix vs SvelteKit), a specific runtime (Node vs Bun vs Deno), or specific monorepo tooling. Those decisions live in packs and are read from `.void/config.json` at runtime.

### Portable hook runtime

Inline enforcement rules live as pure TypeScript in
`packages/hook-runner/src/rules/`. Lifecycle policies and bounded imperative
adapters live under `packages/hook-runner/src/lifecycle/`. The generated
`_void-hook.mjs` normalizes Claude and Codex inputs, bounds invalid/binary
payloads, executes commands with `shell:false`, applies timeouts and maps common
verdicts to exit 0/2.

Native Claude and Codex manifests invoke that bundle directly. A local install
stages exactly one runtime asset, regardless of platform. The short shell files
under `core/hooks/` are compatibility adapters for older installs; v3 manifests,
receipts and health checks do not depend on them. `_hooklib.sh` and `_checks.sh`
remain characterization inputs only and are not part of the active runtime.
The local runtime therefore requires Node only, not `jq` or a POSIX shell.

Every active hook records a bounded, redacted `hook.completed` event. Lifecycle
states distinguish `ok`, `skipped` and `degraded`; enforcement additionally
records `blocked`. Formatting touches only files named by the tool call. Output
trimming spills the full result under `.void/outputs/`, and typecheck is scoped
to changed TypeScript plus the nearest tsconfig where the command supports it.

Two content-aware hooks sit beside the filename/path guards:

- **`secret-in-content.sh`** (PreToolUse Edit|Write, blocking) — the companion to
  `protect-sensitive-files.sh` (which only guards known secret *filenames*). It
  scans the edit's new content for high-confidence vendor tokens (AWS/GitHub/
  Stripe/OpenAI/Anthropic/Slack/Google keys, PEM headers) and one guarded generic
  rule (a `*_KEY|_SECRET|_TOKEN` var assigned a long, mixed, non-placeholder
  literal — excluding UUIDs, git shas, and env indirection). Bounded to the edit
  (never the repo; that is gitleaks/CI). Escape hatch: `// allow-secret-pattern:`;
  test/fixture paths are skipped.
- **`stop-typecheck.sh`** (Stop, **advisory**) — when a TS project has uncommitted
  `.ts` changes at end of turn, it runs a timeout-bounded `tsc --noEmit` scoped to
  the nearest tsconfig of the touched files and surfaces type errors on stderr, so
  the "typecheck clean" item of `verification-before-completion` is answered from
  observation. It **never blocks** (a blocking Stop would trap the session) and
  no-ops with no TS project, no TS edit, or no `tsc`.

### Pack independence

A pack **may not carry a bundled runtime `dependencies` edge on another pack** — that hides a dependency graph and couples release cycles. If two packs share substantial logic, that logic belongs in `core/`.

One exception is allowed: an **explicit, documented `peerDependency` of composition** — a stack pack that deliberately presupposes another (e.g. `pack-nextjs` peer-depends on `pack-monorepo` for the `Result`/`ok`/`err` primitives, and `init` co-installs them). This is not a hidden edge: it is declared in `package.json` `peerDependencies`, documented in the pack README, and the consumer installs both. Extracting three functional primitives into their own package to avoid it would be premature (see `package-extraction`). Prefer this over a new shared package when the shared surface is small and the composition is intentional.

### CLI scope

The CLI is the only entry point. It:

1. Installs core into `~/.claude/voidcorp/`
2. Adds packs to the current project's `.claude/` (via symlink or copy)
3. Updates both
4. Runs `doctor` to detect drift / corruption / version mismatch
5. Runs `init` to create `.void/config.json` in a new project

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

`apps/eval-harness` (`@voidcorp/eval-harness`) is the **behavioral** skill eval. The
`test/` suite proves a skill's *form* (frontmatter, size, structure); this proves its
*effect*: it runs a fixture task with the skill's `SKILL.md` body (frontmatter
excluded) appended to the system prompt and without it, N times each, and scores
the delta. A skill "works" when the
with-skill mean beats the without-skill mean past a noise threshold. It makes every
prose change testable (and the gstack vendoring verifiable — is the distillate as good
as the source?). Same functional-core / imperative-shell split: pure `scorers.ts` +
`runner.ts` (unit-tested, no LLM) behind a `RunOnce` port, with the `claude -p` sandbox
adapter as the only impure edge. **Deterministic scoring first** — assertions over the
final files / git state (commit-discipline is scored with zero LLM judge); an LLM judge
is a last resort. Isolation: `--setting-sources ""` + a fresh sandbox dir keep global
plugins/skills/`CLAUDE.md` out of the baseline without relocating the config dir (so
OAuth still works); any constant bias cancels in the with-minus-without delta. Runs cost
tokens, so it is a **local command (`pnpm eval <skill>`), never a blocking CI gate** in
v1. See `apps/eval-harness/README.md` for the method.

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
correlates it with local mission journals (`.void/runs/*/events.jsonl`, plus
read-only v2 import, and transcripts). `graph live` serves the inlined studio
and a `/studio-data.json` endpoint on loopback - fully offline. Freshness
is gated by `graph check-bundle` (the artifact's embedded model must match `model.json`); see
DECISIONS.md (2026-07-01). The artifact is excluded from the `core-assets` mirror.

## Mission event journal (`.void/runs/<mission-id>/events.jsonl`)

### Deterministic mission planning

Before runtime orchestration, `@voidcorp/mission-engine` compiles bounded ticket, diff, stack, and
policy values into an explained risk classification, a complete applicability matrix, and a
canonical DAG. The package remains pure: YAML, filesystem confinement, Git inspection, and stack
detection stay in the `voidharness` CLI shell.

Policy precedence is `core < profile < organization < project`. Overrides are monotonic by default;
weakening requires a visible, approved, expiring waiver. The compiler rejects unresolved conflicts
and gives every quality-floor pass an initial state plus an input hash. `planHash` excludes only the
observation timestamp. The paths, schema, failure contract, and rollback are documented in
[`POLICIES.md`](POLICIES.md).

The public boundary is:

```text
strict YAML + root-confined files ──> CLI policy loader
                                      │
                                      v
                         pure policy/risk/mission compiler
                                      │
                                      v
                    risk + applicability + canonical DAG
```

All runtimes now emit one strict, versioned event contract. `@voidcorp/mission-engine`
validates bounded JSON and reduces it without I/O. `@voidcorp/hook-runner` adapts
Claude/Codex hook payloads, redacts content, derives an opaque mission ID and
assigns a continuous per-mission sequence under an exclusive cross-platform lock.

The canonical append-only line contains `schemaVersion`, `seq`, opaque `eventId`
and `missionId`, UTC time, source, dotted kind, subject, correlation and bounded
payload. Attempts, outcomes and Stop therefore share one writer and one ordering.
The writer rejects path escapes and symlinks, isolates a partial tail, uses
user-only modes where supported and never blocks the agent runtime on telemetry
failure. The same generated dependency-free Node bundle also owns the critical
inline/CI enforcement rules. It is rebuilt by `pnpm hooks:build` and gated for
drift before `core-assets` is mirrored.

Graph behavior, cost, audit, status and Studio consume the canonical journal.
Legacy `.void/activations.jsonl`, `.void/outcomes.jsonl` and `.void/usage.log`
remain read-only transition inputs; current hooks never append to them. Each
project self-registers an opaque pointer under `~/.void/projects/` for opt-in
cross-project aggregation.

`graph live` binds loopback only. A random launch token is exchanged once for a
process-local `HttpOnly; SameSite=Strict` cookie, foreign browser origins are
rejected, and every data/SSE route requires the session. SSE uses the stable
event ID, honors `Last-Event-ID` (or the first-connect `after` cursor), backfills
the bounded snapshot and reports discontinuity as `PARTIAL`, never as live truth.
Studio renders `LIVE`, `RECONNECTING`, `STALE`, `PARTIAL`, `REPLAY` and `OFFLINE`.

### Evidence, findings and verdicts

The journal is also the single source for mission quality. A run keeps immutable
metadata in `mission.json`, canonical events in `events.jsonl` and optional
redacted quarantine copies under `quarantine/`. Findings, resolutions,
exceptions and evidence are event kinds, not independently mutable ledgers.
Separate `findings.jsonl`, `evidence.jsonl` or UI summaries may exist only as
rebuildable projections.

Command evidence records redacted argv, exit code, start/end/duration, producer,
source, confidence, bounded output, affected file nodes, input hash, diff hash
and typed dependency hashes. `canonicalJson` sorts object keys recursively before
SHA-256 sealing. The checksum proves canonical integrity and detects corruption;
it is deliberately not described as a signature against a user who controls the
local machine.

The pure verdict reducer compares only declared dependency hashes. A changed Git
worktree invalidates diff-dependent evidence without invalidating an unrelated
proof. Open non-waivable blockers remain blocking; accepted waivers yield
`shipped-with-exception`, never `verified`. Missing/stale proof yields
`unverified`; malformed, duplicate, cross-mission or integrity-broken input
yields `degraded`. The projection carries no evaluation timestamp, so replay of
the same journal and dependency context is byte-for-byte deterministic.

`void-harness mission` exposes the operator lifecycle:

- `start --title ... [--mode fast|team|fortress]` creates a team-mode run by
  default;
- `verify --id ... -- <argv...>` executes with `shell:false`, captures a redacted
  bounded proof and returns the current verdict; `--shell` is explicit;
- `inspect --id ... [--json]` recomputes the current Git diff and exits non-zero
  unless the verdict is shippable;
- `archive --id ...` writes an explicit `.jsonl.gz` snapshot only for
  `verified` or `shipped-with-exception`;
- `prune --older-than ...` is a dry-run unless `--apply` is supplied and removes
  only runs that already have an archive.

Invalid journal lines are preserved for forensics and copied once, redacted and
bounded, into quarantine; they are never silently repaired. Runtime journals and
archives are local artifacts ignored by Git. There is no automatic retention or
network upload.

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

## Node frontmatter: `owner` (governance)

The capability contract (spec `2026-07-21-void-harness-public-multiruntime-os`, Phase A) is authored
as **SKILL.md frontmatter fields** — the same channel `activation`/`triggers` already use, so no new
file discovery is introduced. The first field is `owner:` — the accountable maintainer of the
capability. It is read in `read-frontmatter.ts` (`parseOwner`) and threaded onto `GraphNode.owner`.

Governance is **fail-closed**: the `missing-owner` detector (`analyze/missing-owner.ts`, wired into
`DETECTORS`) emits a blocking `error` for any **skill** node with no `owner`, so `graph check` (and
the CI "Graph integrity" gate) fails. No capacity ships without a proof of ownership. The rule is
scoped to skills — hooks, commands, packs, and agents are not capabilities.

Two more contract fields land through the same seam (`read-frontmatter.ts` → `GraphNode`):

- `runtimes:` — the runtimes a capability declares it supports (`[claude, codex]`). A second
  fail-closed detector, `missing-runtimes`, blocks any skill that declares none (the runtime matrix
  cannot place an undeclared capability).
- `enforcement:` — the **two-tier** enforcement contract (spec Fork 1). `floor: ci` is the
  runtime-agnostic CI floor (the void-enforce Action) every runtime inherits; `inline` is the
  per-runtime in-session tier (`pretooluse` where the runtime supports a blocking hook, `active`
  otherwise, `ci-only` for Hermes). The `inline.{claude,codex}` tier is **derived, not
  hand-classified**: a skill that is the target of an `enforces` edge gets `pretooluse`, else
  `active` — so the map cannot drift from the actual hook wiring. Enforcement is declared per runtime
  and never masked; Hermes' `ci-only` is a structural limit, scored on its own ceiling, not a failure.

Two more fields complete the authored contract (A3):

- `eval_targets:` — the `(runtime, provider, tier)` cells a capability is authored/certified for,
  **slug-encoded** `runtime/provider/tier` in a normal YAML list (`[claude/anthropic/opus]`). The slug
  form is parsed by the shared `parseList` helper (reused with `runtimes:`), not a fragile
  hand-rolled list-of-maps parser. It drives which cells the certification manifest (A4) may mark
  `effective`.
- `success_signal:` — an optional human-readable "what good looks like" sentence. Not
  mass-backfilled (a uniform placeholder would be dishonest, unlike `owner: folpe` which is
  uniformly true); authored per skill over time.

Two shared frontmatter helpers back these fields so the scalar and list parsers cannot diverge:
`parseScalar(block, key)` (quote-stripping, YAML-nil-aware — used by `owner` and `success_signal`)
and `parseList(block, key)` (flow or block YAML list — used by `runtimes` and `eval_targets`).

### The certification manifest (`certification.json`)

The capability contract is frozen, per release, into `packages/harness-graph/certification.json` (A4).
It is the input `ProjectState` (Phase B) reads for the repo-authored half of the five-state model —
never recomputed on a consumer machine. `buildCertification(model, reports, harnessVersion)`
(`src/certification/build.ts`, pure) joins the graph model's capability fields with the eval-harness
JSON reports:

- `proof.verified` is **structural** — the capability declares an owner and at least one runtime.
- `proof.effective` obeys an **honesty invariant**: it exists only when a real eval report for the
  skill exists, its verdict is `skill-helps`, and the capability declares an eval target cell to place
  the delta on. Never inferred, never faked. Today there are no eval JSON reports, so the manifest
  ships **64 capabilities, 0 effective** — the honest current state; `effective` populates in Phase E
  when the paid evals run and emit `apps/eval-harness/reports/<skill>.json`.

`certification.json` is a committed artifact regenerated by `pnpm certification:build`; `pnpm
certification:check` gates drift in CI (mirrors `decisions:check` / `graph:check`). Two things are
**deliberately deferred** (YAGNI): baking the manifest into the consumer `void-graph` bundle (nothing
reads it until Phase B's ProjectState) and the eval-harness JSON emission that populates `effective`
(that is Phase E's paid-eval work). See DECISIONS.md (2026-07-21).

## ProjectState and `void status` (Phase B)

`ProjectState` is the project's legible state: a **deterministic, offline, LLM-free** join of the
frozen `certification.json` (repo-authored proof) with **local signals** (which capabilities are
materially installed, which passed executable runtime postconditions, which fired in canonical
mission events, and the tri-state runtime evidence). The pure core
lives in `packages/harness-graph/src/state/` — `computeProjectState` derives each capability's
five-state (`available → installed → verified → used → effective`). Local `verified` now requires a
compatible runtime with `installed=yes`, `wired=yes` and `fired=yes`; the frozen structural proof is
reported separately as `certified`. `effective` requires both that local chain and certified
behavioral proof plus real local use. Each runtime carries independent `installed`, `wired`,
`fired`, `observed` and `certified` fields; `null` means `unknown`, never success.
`scoreProjectState` scores the eight dimensions (blocker/gauge,
cap-69 on a red failure-predicate, pending dimensions excluded, confidence band, impact-ranked next
actions — see DECISIONS.md 2026-07-21). Both are pure: no I/O, no clock, no model call.

`void-harness status` (`packages/cli/src/commands/status.ts`) is the imperative shell: it reads the
certification + model + telemetry, executes each detected adapter's bounded local postconditions,
calls the pure core, renders the terminal surface, and persists
`.void/state.json` plus a `.void/history/<ts>.json` snapshot (both git-ignored, per-project runtime
state). `generatedAt` is stamped by the shell so the core stays deterministic. Missing runtime,
cost, smoke or observation data stays `unknown`/pending and is excluded from scores instead of being
invented. Consumer-side bundled-certificate resolution and pack-aware filtering remain local and
offline.

## .void/config.json (consumer-side)

Generated by `void-harness init`. Lives at `.void/config.json` in the consumer project.

The `packs` field pins the **marketplace plugins** that were enabled, keyed
`@voidcorp/<plugin-name>` (the plugin name, e.g. `harness-nextjs`, scoped under
`@voidcorp/`), each mapped to the version it was pinned at. These are plugin
references, not npm package names: the npm packages are `@voidcorp/pack-<stack>`,
the plugins they pair with are `harness-<stack>`. `doctor` reads this field to
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
| Self-host release gate | compiles current sources in isolation; rejects source/receipt/hook/replay drift |
| Graph integrity | `pnpm graph:check` — model.json drift + broken routes + capability governance (owner/runtimes) |
| Certification freshness | `pnpm certification:check` — committed `certification.json` matches the model + eval reports |
| Consumer bundle freshness | `pnpm graph:check-bundle` — the shipped `void-graph.mjs` embeds the current `model.json` |
| Skill tests | `pnpm vitest run` |
| Typecheck | `pnpm -r typecheck` |

Roadmap (documented intent, not yet wired): skill front-matter schema check,
per-hook smoke tests on a sample repo, CLI integration tests on a fresh fixture.
Releases are cut with `scripts/bump-version.mjs` (lockstep), not changesets; the
`.changeset/` directory is unused.

## Server-side floor (the void-enforce Action)

Local PreToolUse hooks only enforce the floor on the machine running them — a
cloud agent, a `--dangerously-skip-permissions` run, or any non-Claude author
never sees them. The **void-enforce Action** replays the same floor on every PR,
server-side, so the floor is incontournable regardless of author. It complements
(does not replace) the server-side branch protection `backlog-autopilot` already
requires.

- `core/enforce/ci-enforce.sh` — the diff driver. Given `--base <ref>`, it walks
  the PR diff (`git diff base...HEAD`), runs the ADDED lines / changed paths
  through the shared Node rules (protected path, secret content, TDD) plus the
  transitional `_checks.sh` boundary predicate, and emits GitHub
  `::error file=,line=::` annotations. It lives under `enforce/` (not `hooks/`)
  because it is a CI tool, not a Claude-runtime hook: that keeps the `hooks/ =
  runtime` boundary honest and keeps the driver out of the 100-LOC hook cap.
- `.github/actions/void-enforce/action.yml` — composite action wrapping the
  driver; resolves the base from the PR context and runs the bundled script.
- `.github/workflows/enforce.yml` — reusable workflow (`workflow_call`) a
  consumer adopts in ≤5 lines (`uses:
  voidcorp-core/void-harness/.github/workflows/enforce.yml@main`).
- `.github/workflows/void-enforce.yml` — void-harness's own dogfood, using the
  *local* composite so a check change is validated by the same PR that makes it.

**Fail-closed** is the invariant (the #62-64 class): a missing prerequisite, an
unresolvable base ref, a missing merge-base, or any git error is an explicit red
check, never a silent green. Escape hatch: `.github/void-enforce-allow` lists
path globs the driver skips (each skip logged) — the committed, reviewable
equivalent of the local `VOID_HARNESS_ALLOW_SECRET_EDIT` override, for files
legitimately named like a secret store.
An exact generated artifact may also be exempt only when its authored sources
remain scanned and a deterministic freshness gate verifies the artifact in the
same CI. This repository applies that rule to the single-file consumer graph
bundle, whose size exceeds the bounded hook protocol; `graph:check-bundle`
proves its source/model correspondence. Broad generated-directory globs remain
forbidden.
`void-harness doctor` reports (advisory, never blocking) whether a project has
adopted the workflow. v1 replays three checks: sensitive-path, secret-content,
boundary-direction. Destructive-shell stays a local runtime guard only — a
committed pattern self-matches the detector/docs/fixtures, a net-negative false
positive for a floor check (see DECISIONS). The project test gate stays the
consumer's own CI (this Action enforces the doctrine floor, not general quality —
it must not double the existing CI).
