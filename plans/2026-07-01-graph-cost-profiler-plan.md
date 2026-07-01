---
title: graph cost profiler (sub-project A)
date: 2026-07-01
status: in-progress
spec: docs/specs/2026-07-01-graph-cost-profiler.md
author: Folpe + Claude
high_risk: false
---

## Goal

Ship **A**, the cost-aware analysis core: a pure `analyzeCost` kernel in
`packages/harness-graph/src/cost/` plus a `graph cost` CLI subcommand that attributes
token cost per harness component and flags the ones that do not earn their place (dead,
dead-hook, underused, expensive, low-yield). Static cost (per-node source tokens ×
frequency) ships first and runs with zero transcripts; real cost (transcript tokens,
cache-aware, correlated per session, priced) rides on top as phase 2. Advisory-only,
HITL absolute. Extends the M8 behavior kernel and reuses its `triggerMatches`.

Vertical slicing: each step ships end-to-end testable value. The model→rows seam is
exercised in Step 1, before any build wiring, so contract mismatches surface early.

Note (not high-risk, but load-bearing): the transcript adapter reads
`~/.claude/projects/**/*.jsonl`, which contains prompt content. It MUST aggregate only
`usage` token counts + `timestamp` + `sessionId` + `model` — never prompt/response text.
No transcript content leaves the process or reaches any output.

---

## Phase 1 — static + structure (no transcripts, usable immediately)

### Step 1 — Cost types + `analyzeCost` static core

- **Goal**: pure kernel that turns `(model, activations)` into cost rows with
  `invocations`, `staticTokens`, and the static flags `dead` / `underused` / `low-yield`.
- **Depends on**: none
- **TDD mode**: strict
- **Verification gate**: `pnpm --filter @voidcorp/harness-graph test` green on the new
  `cost/analyze.test.ts`; `pnpm --filter @voidcorp/harness-graph typecheck` clean.
- **Expected commits**:
  - `test(harness-graph): cost row + static flag derivation`
  - `feat(harness-graph): analyzeCost static core + cost types`
- **Notes**: Add `cost/types.ts` (`SessionCost`, `CostRow`, `CostReport`, `PricingTable`,
  `CostFlag`, `CostOptions`) and `cost/analyze.ts`. Add `staticTokens?: number` to
  `GraphNode` (`model/types.ts`). In static-only mode `realSignal` is `null`,
  `cacheReadRatio` is `null`, `mode: 'static-only'`. Rows sorted by cost desc (static:
  `staticTokens × invocations`). `dead` = fire-capable node, 0 invocations. `underused` =
  invocations below `opts.underusedBelow` (default 2). `low-yield` = high `staticTokens`
  with low invocations (define the ratio explicitly in the test). Volume guard mirrors
  `BehaviorReport` (`minSessions`/`minEvents`, `sufficient`). Export from
  `harness-graph/src/index.ts`. Factory helpers mirror `behavior/index.test.ts`.

### Step 2 — Build: compute `staticTokens` per node

- **Goal**: `graph build` populates `node.staticTokens` from each node's source.
- **Depends on**: [step-1]
- **TDD mode**: strict for the pure count helper; souple for the build wiring.
- **Verification gate**: `pnpm --filter @voidcorp/harness-graph test` green on the
  token-count helper; `void-harness graph build` runs and the emitted model carries
  non-zero `staticTokens` on skill/agent/hook nodes (spot-checked).
- **Expected commits**:
  - `test(harness-graph): source token estimate (chars/4)`
  - `feat(cli): compute staticTokens at graph build`
- **Notes**: Pure helper `estimateTokens(source: string): number` = `ceil(chars/4)`,
  lives in the kernel. The build already reads source files to compute `lines` — add the
  estimate alongside. No new file reads.

### Step 3 — Dead-hook detection

- **Goal**: hook nodes carry their `plugin.json` matcher as `triggers`; `analyzeCost`
  emits `dead-hook` for a hook whose matcher matched no recorded situation.
- **Depends on**: [step-1, step-2]
- **TDD mode**: strict for the kernel `dead-hook` path; souple for the matcher ingest at build.
- **Verification gate**: `pnpm --filter @voidcorp/harness-graph test` green on the
  `dead-hook` cases (matched → alive, never-matched → dead-hook); `graph build` emits
  hook nodes with populated `triggers`.
- **Expected commits**:
  - `test(harness-graph): dead-hook via matcher-vs-situations`
  - `feat(harness-graph): dead-hook flag reusing triggerMatches`
  - `feat(cli): ingest plugin.json hook matchers into node triggers at build`
- **Notes**: Add `'hook'` to `NodeType` if absent. Situations = all `ActivationTrigger`
  values across activations (the meter's `PreToolUse *` events). Reuse M8
  `triggerMatches`. A hook fires deterministically on matcher match, so this is near-exact,
  not soft inference — the flag copy still says "candidate".

### Step 4 — CLI `graph cost` (static-only mode)

- **Goal**: `graph cost` runs end-to-end in the monorepo and renders the static table +
  flags.
- **Depends on**: [step-1, step-2, step-3]
- **TDD mode**: souple (thin shell over the pure kernel)
- **Verification gate**: `void-harness graph cost` on the monorepo prints a sorted table
  with `invocations`, `staticTokens`, and flags; exits 0; `pnpm build` + `pnpm test` green.
- **Expected commits**:
  - `feat(cli): graph cost subcommand (static-only render)`
- **Notes**: Wire in `commands/graph.ts` dispatch (`args[0] === 'cost'`). `loadModel()` +
  read `.void/activations.jsonl` (reuse `parseActivations`, honor `--log`/`--since`).
  Render mirrors the `behavior` report style. `mode: 'static-only'` when no transcripts.

### Checkpoint A — after Step 4

User runs `void-harness graph cost` on the real monorepo and reviews the static report
(are the dead/dead-hook/underused/low-yield flags sane against the actual harness?).
Stop here. Run `harness:verification-before-completion`. Wait for user signal to proceed
to phase 2.

---

## Phase 2 — real cost (transcripts, cache-aware, priced)

### Step 5 — Pricing kernel

- **Goal**: pure pricing — baked default `model→$/Mtok` table, optional override merge,
  `deriveDollars(tokens, model, pricing)`.
- **Depends on**: [step-1]
- **TDD mode**: strict
- **Verification gate**: `pnpm --filter @voidcorp/harness-graph test` green on
  `cost/pricing.test.ts` (default lookup, override merge, unknown model → 0 + no throw,
  cache-read priced separately).
- **Expected commits**:
  - `test(harness-graph): pricing table + deriveDollars`
  - `feat(harness-graph): default pricing table + override merge`
- **Notes**: Defaults keyed by model id (opus-4-8, sonnet-4-6, haiku-4-5, ...). Unknown
  model → dollars `null`, never throw. Tokens remain the source of truth; `$` is derived.

### Step 6 — Transcript adapter

- **Goal**: read `~/.claude/projects/<encoded-cwd>/*.jsonl` and aggregate per session into
  `SessionCost[]`, tolerant to format drift.
- **Depends on**: [step-1]
- **TDD mode**: strict for the pure parse/aggregate; souple for the fs walk.
- **Verification gate**: `pnpm --filter @voidcorp/harness test` green on fixture JSONL
  (valid lines aggregate; malformed lines skipped and counted; cache tokens broken out;
  missing dir → empty + no throw).
- **Expected commits**:
  - `test(cli): transcript usage aggregation (tolerant parse)`
  - `feat(cli): transcript-cost adapter reading ~/.claude/projects`
- **Notes**: `packages/cli/src/lib/transcript-cost.ts`. Pure
  `aggregateSessionCosts(lines): { costs; skipped }` requires only
  `usage`/`timestamp`/`sessionId`/`model`; skip anything else. `tsRange` = first/last
  timestamp. Encoded-cwd derivation matches Claude Code's dir naming. **Never read prompt
  content** — only `usage` counts.

### Step 7 — `analyzeCost` real layer

- **Goal**: correlate `SessionCost` with activations, compute per-metric median real
  signal, `cacheReadRatio`, `expensive` flag, `mode: 'full'`.
- **Depends on**: [step-1, step-5, step-6]
- **TDD mode**: strict
- **Verification gate**: `pnpm --filter @voidcorp/harness-graph test` green (session join
  by `sessionId`; realSignal = per-metric median across sessions where the node fired;
  `expensive` = top-decile session cost; intersection-only correlation; static-only path
  unchanged).
- **Expected commits**:
  - `test(harness-graph): real-cost correlation + expensive flag`
  - `feat(harness-graph): analyzeCost real layer (median per session)`
- **Notes**: `realSignal.dollars` = median of qualifying sessions' total `$`;
  `realSignal.tokens` = per-field median; `cacheReadRatio` derived from those medians.
  Sessions in only one side contribute nothing to the real signal. Keep the static-only
  path a strict subset (regression-guard it).

### Step 8 — CLI `graph cost` full mode

- **Goal**: `graph cost` full mode end-to-end — real + `$` + cache columns, pricing
  override, `--pricing`/`--since` flags, `skippedTranscriptLines` in stats.
- **Depends on**: [step-4, step-7]
- **TDD mode**: souple
- **Verification gate**: `void-harness graph cost` on real transcripts prints the full
  table (real tokens, `$`, cache ratio, flags), reports skipped lines, falls back to
  `static-only` when the transcript dir is absent; `pnpm build` + `pnpm test` green.
- **Expected commits**:
  - `feat(cli): graph cost full mode (real cost + pricing)`
- **Notes**: Load pricing = defaults merged with `.void/pricing.json` (malformed →
  defaults + stderr warn). Pass `sessionCosts` from Step 6 adapter. Render adds the real
  columns only in `mode: 'full'`.

### Checkpoint B — after Step 8

User runs full `graph cost` on real transcripts and sanity-checks the correlational
signal (are the expensive/low-yield candidates believable?). Stop here. Run
`harness:verification-before-completion`.

---

## Review checkpoints

- **Checkpoint A** — after Step 4 (phase 1, static report usable in monorepo).
- **Checkpoint B** — after Step 8 (phase 2, full real-cost report).

---

## Resume point

**Next step**: Checkpoint A (user review) → then Step 5 (Pricing kernel)

**Completed** — PHASE 1 DONE:
- ✅ Step 1: Cost types + analyzeCost static core (commit `79b5781`). doctrine-critic
  pass applied. Note: `NodeType` already had `'hook'`.
- ✅ Step 2: staticTokens at build (commits `3d1e3d7`, `0acd6d8`). `estimateTokens` (~chars/4).
- ✅ Step 3: Dead-hook (commits `8c0486c` parseHookMatchers, `66fce75` build ingest, `f95249c`
  kernel flag). KEY REALITY: plugin.json matcher encodes TOOL ONLY (no path/glob) — hook
  triggers are `tools`-only. Ingest lives in harness-graph `scanSourceTree` (not cli as the
  plan said). 12 core hooks get triggers; precommit/wildcard hooks stay unassessable by design.
- ✅ Step 4: CLI `graph cost` static-only render (commit `283e7e2`). Renders flagged rows only,
  no silent cap. Verified end-to-end on synthetic ≥3-session data: dead / underused / low-yield
  / dead-hook all surface correctly. Full suite: 527 tests green.

**Pending** (phase 2):
- ⏳ Step 5: Pricing kernel
- ⏳ Step 6: Transcript adapter
- ⏳ Step 7: analyzeCost real layer
- ⏳ Step 8: CLI graph cost full mode → Checkpoint B
- ⏳ Step 4: CLI graph cost (static-only) → Checkpoint A
- ⏳ Step 5: Pricing kernel
- ⏳ Step 6: Transcript adapter
- ⏳ Step 7: analyzeCost real layer
- ⏳ Step 8: CLI graph cost full mode → Checkpoint B
