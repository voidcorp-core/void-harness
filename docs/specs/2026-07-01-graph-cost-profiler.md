---
title: graph cost profiler (sub-project A — cost-aware analysis core)
date: 2026-07-01
status: approved
author: Folpe + Claude
related:
  - docs/specs/2026-06-26-harness-graph-viz.md
  - docs/specs/2026-06-29-graph-behavior-m8.md
  - docs/specs/2026-06-29-graph-live-p2.md
---

# graph cost profiler — sub-project A

## Goal

Fine-tune the **harness itself** via the graph: does every hook / skill / agent earn
its place? Detect dead and underused components, and attribute **token cost** per
component, to trim and tune the harness. Not just LLM cost — component-level
composition quality. This spec covers **A**, the cost-aware analysis core (pure kernel
+ CLI), which runs in the monorepo immediately. B (consumer delivery via plugin assets)
and C (studio cost viz) are separate specs, built after A.

Extends the M8 behavior kernel (`graph behavior`: `dead-node`, `should-have-fired`)
with cost. Reuses M8's mechanical trigger matching. Advisory-only, HITL absolute — the
profiler never removes a component; it surfaces candidates.

## Locked decisions (from brainstorm)

- **Consumer model scope** = the harness components installed (not project-local custom
  skills; not raw-activation-only). For A, the scope is the monorepo's own graph model.
- **Real-cost attribution = correlational per session** (Q1). No fabricated per-component
  split. A component's real signal = the **median total cost of the sessions where it
  fired**. Correlation, not causation — the flags use "candidate" language, never verdict.
- **Cost model = both static + real, phased** (Q3). Static = per-node source tokens
  (chars/4) × frequency — exact, deterministic, ships in phase 1. Real = transcript
  tokens (cache-aware) correlated by session — phase 2.
- **Pricing = default `model→$/Mtok` table baked in the kernel, overridable via optional
  `.void/pricing.json`** (Q3). Tokens are the source of truth; dollars are a derived
  post-multiply column.
- **Dead-hook = matcher-vs-situations inference** (Q4). A hook fires deterministically
  when its `plugin.json` matcher (tool + path glob) matches a situation. The build
  ingests hook matchers into hook nodes' `triggers`; the kernel reuses `triggerMatches`
  against recorded situations. A matcher never matched = dead by opportunity. Near-exact
  because hook firing is deterministic (unlike discretionary skills). Zero hot-path writes.
- **Output = data + advisory flags** (Q5). Per-component rows plus derived `severity:info`
  flags. Same shape as `BehaviorFinding`. Flags are suggestions, never auto-applied.
- **Delivery = via plugin assets, zero npm** (initiative-level). A ships in the monorepo;
  consumer packaging is sub-project B.

## Architecture

Same split as M8: a **pure kernel** in `packages/harness-graph/src/cost/` (mirror of
`behavior/`), and an **imperative shell** in `packages/cli`. Public pure entrypoint:

```ts
function analyzeCost(
  model: GraphModel,
  activations: readonly ActivationEvent[],
  sessionCosts: readonly SessionCost[],
  pricing: PricingTable,
  opts?: CostOptions,
): CostReport
```

No I/O in the kernel. The shell performs the three reads (model, activations,
transcripts) and the render.

## Components

| Component | Path | Purity | Owns |
|-----------|------|--------|------|
| cost kernel | `packages/harness-graph/src/cost/analyze.ts` | pure | `analyzeCost` — per-node rows + flags |
| pricing | `packages/harness-graph/src/cost/pricing.ts` | pure | default table + override merge, `deriveDollars` |
| cost types | `packages/harness-graph/src/cost/types.ts` | pure | `SessionCost`, `CostRow`, `CostReport`, `PricingTable`, `CostOptions` |
| build extension | `packages/cli` graph build path | shell + pure helper | compute `staticTokens` per node; ingest hook `plugin.json` matchers into `node.triggers` |
| transcript adapter | `packages/cli/src/lib/transcript-cost.ts` | shell + pure parse | walk `~/.claude/projects/<encoded-cwd>/*.jsonl`, tolerant parse, aggregate → `SessionCost[]` |
| CLI subcommand | `packages/cli/src/commands/graph.ts` | shell | `graph cost [--since N] [--pricing path] [--log path]`, render |

### Model changes

- `GraphNode` gains `staticTokens?: number` (mirror of `lines`, computed at build).
- `NodeType` gains `'hook'` (if not already present); hook nodes carry `triggers`
  derived from their `plugin.json` matcher (`{tools, globs}`).

### New types (sketch)

```ts
interface SessionCost {
  sessionId: string;
  model: string;
  tokens: { in: number; out: number; cacheRead: number; cacheCreation: number };
  tsRange: { first: string; last: string };
}

interface CostRow {
  nodeId: string;
  name: string;
  kind: NodeType;
  invocations: number;
  staticTokens: number;
  realSignal: { tokens: SessionCost['tokens']; dollars: number } | null; // null in static-only mode
  cacheReadRatio: number | null;
  flags: CostFlag[]; // 'dead' | 'dead-hook' | 'underused' | 'expensive' | 'low-yield'
}

interface CostReport {
  sufficient: boolean;      // volume guard, like BehaviorReport
  stats: { sessions: number; events: number; skippedTranscriptLines: number };
  rows: CostRow[];          // sorted by cost desc
  mode: 'static-only' | 'full';
}
```

## Data flow

1. `graph build` (extended) → model with `staticTokens` + hook `triggers`.
2. `graph cost`:
   - `loadModel()` → `GraphModel`
   - read `.void/activations.jsonl` → `ActivationEvent[]` (who fired, which session,
     which situation)
   - transcript adapter → `SessionCost[]` (phase 2; empty in phase 1 / when dir absent)
   - pricing = defaults merged with optional `.void/pricing.json`
   - `analyzeCost(...)` → `CostReport`, render to stdout (table + flags)
3. Join on `sessionId` (activations ⋈ transcripts). Real signal of a component =
   the **median across the sessions where it fired**, computed per metric:
   `realSignal.dollars` = median of each qualifying session's total `$`;
   `realSignal.tokens` = per-field median (median `in`, median `out`, median
   `cacheRead`, median `cacheCreation`); `cacheReadRatio` derived from those medians.
   Sessions present in only one side are handled: only the intersection contributes to
   the real signal.

### Flag derivation (all `severity:info`)

- `dead` — fire-capable node, 0 invocations across the window.
- `dead-hook` — hook node whose matcher matched **no** recorded situation.
- `underused` — invocations below a threshold (default configurable, e.g. `< 2`).
- `expensive` — real signal in the top decile of session cost.
- `low-yield` — high `staticTokens` relative to invocations (loads a lot, rarely fires).

## Error handling

- **Transcript format drift**: tolerant parser. Skip malformed lines; require only
  `usage` / `timestamp` / `sessionId` / `model`. **Never crash.** Report
  `skippedTranscriptLines` in stats.
- **Volume guard** (M8 parity): below `minSessions` / `minEvents` → `sufficient: false`
  + advisory; still render what exists.
- **Transcript dir absent**: `sessionCosts` empty → `mode: 'static-only'` report
  (graceful degrade, not an error).
- **Malformed `pricing.json`**: fall back to baked defaults + warn on stderr.
- **`sessionId` mismatch**: a session in transcripts with no activation record (or vice
  versa) contributes only where both sides exist.

## Testing approach

- **Kernel** (`cost/analyze.ts`, `cost/pricing.ts`): vitest, factory helpers
  (`node`, `activation`, `sessionCost`). Cover each flag derivation, median math,
  session join, static-token multiply, pricing merge + `deriveDollars`, volume guard.
- **Transcript pure parse**: fixture JSONL lines → `SessionCost` aggregation, including
  malformed-line skipping and cache-token breakdown.
- **Static token + matcher parse helpers**: pure, direct unit tests.
- **fs walk / CLI wiring / render**: thin shell, lighter coverage.

## Rollout / phases

- **Phase 1 — static + structure** (no transcripts, usable immediately):
  `staticTokens` on nodes, hook matcher ingest + `dead-hook`, flags
  `dead` / `underused` / `low-yield`, `graph cost` CLI + render in `static-only` mode.
- **Phase 2 — real cost**: transcript adapter, `SessionCost` correlation, pricing, real
  + $ + cache-ratio columns, `expensive` flag, `mode: 'full'`.

## TDD mode per phase

| Work | Mode |
|------|------|
| kernel `cost/*.ts` (analyze, pricing, median, join) | strict |
| transcript pure parse, static-token count, matcher parse | strict |
| build extension (fs side), fs walk, CLI wiring, render | souple |

## Out of scope (deferred)

- **B** — consumer all-in-one delivery (bundle kernel+cost+server+studio into plugin
  assets, launch command, model from consumer's installed harness).
- **C** — studio cost viz (node size/color by cost, cost panel, live cost ticking).
- Per-turn marginal or proportional attribution (rejected in Q1 as noise / fake precision).
- Hook self-instrumentation (rejected in Q4 — hot-path writes, redundant with matcher inference).
