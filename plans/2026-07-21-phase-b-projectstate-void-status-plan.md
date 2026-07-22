---
title: Phase B — ProjectState + void status
date: 2026-07-21
status: in-progress
spec: docs/specs/2026-07-21-void-harness-public-multiruntime-os.md
author: Folpe + Claude
high_risk: false
---

## Goal

Turn the frozen capability certification (Phase A) into the project's legible state. A **deterministic,
offline, LLM-free** `ProjectState` joins the shipped `certification.json` (repo-authored proof) with
**local signals** (which capabilities are installed here, which have fired in `.void/activations.jsonl`,
which runtimes are detected) to compute, per capability, the five-state `available → installed → used
→ effective`, plus a **blocker/gauge score** with a confidence band and impact-ranked next actions.
`void-harness status` renders it to the terminal (spec §6) and persists `.void/state.json` +
`.void/history/<ts>.json`. No eval is ever run and no model is ever called on the consumer machine
(spec Fork 5).

Grounding (verified): CLI dispatch is a switch in `packages/cli/src/main.ts` (add a `status` case →
`commands/status.ts`). `certification.json` is at `packages/harness-graph/certification.json` (bundled
for consumers via the void-graph artifact — reuse the same `BUNDLED_*` resolution the graph command
uses). Local telemetry parsers already exist in the kernel: `parseActivations`
(`src/behavior/`) over `.void/activations.jsonl` (`ActivationEvent { ts, kind, name }`), and
`analyzeOutcomes` over `.void/outcomes.jsonl`. The pure state/score logic lives in a new
`packages/harness-graph/src/state/` module (functional core); `status.ts` is the imperative shell.

**Design decision (locked):** the pure core takes already-parsed inputs (`Certification` +
`LocalSignals`) and returns `ProjectState`. All I/O — reading `certification.json`, parsing
`.void/*.jsonl`, detecting runtimes, writing `state.json` — lives in `status.ts`. Same functional-core
/ imperative-shell split the graph kernel uses; keeps the state computation unit-testable with zero
fixtures on disk.

## Steps

### Step B1 — Pure ProjectState core: the five-state per capability (MVP)

- **Goal**: `computeProjectState(certification, signals)` deterministically derives each capability's
  state from the frozen proof + local signals, with no score yet — the spine everything renders from.
- **Depends on**: none (consumes Phase A's `Certification` type)
- **TDD mode**: strict (new core logic)
- **Verification gate**: `pnpm --filter @voidcorp/harness-graph test` green for the state module;
  tests prove every transition — `installed` but not `used`; `used` but not `effective` (no cert
  proof); certified-`effective` **and** used → `effective`; certified-effective but never used-here →
  stays `used`/`installed` (the "installed ≠ available" intent); a capability absent from local
  signals → `available` only.
- **Expected commits**:
  - `test: ProjectState five-state derivation from certification + local signals`
  - `feat: computeProjectState pure core + ProjectState/CapabilityState types`
- **Notes**: `LocalSignals = { installedIds: Set<string>, usedCounts: Map<string, number>,
  runtimesDetected: Set<string> }`. State rule: `effective` = cert `proof.effective` present AND
  `usedCounts > 0` here; `used` = `usedCounts > 0`; `installed` = id in `installedIds`; else
  `available`. `verified` is carried from cert `proof.verified`. Export from `src/index.ts`. New types
  in `src/state/types.ts`, logic in `src/state/compute.ts`.

### Step B2 — Score model: dimensions, blocker/gauge, cap-69, confidence, next actions

- **Goal**: Score the ProjectState into the eight dimensions with the honest blocker-vs-gauge split
  and an impact-ranked action list.
- **Depends on**: B1
- **TDD mode**: strict
- **Verification gate**: unit tests prove — a fresh install (nothing `used`) scores low on the gauges
  but is **not capped** (it is "new, not broken"); a governance blocker (a capability without owner)
  caps the global score at ≤69; Hermes `ci-only` enforcement does **not** cap (per-runtime scoping);
  confidence is `low` when eval coverage/telemetry volume is thin even if the score is high; next
  actions are sorted by descending impact.
- **Expected commits**:
  - `test: score dimensions (blocker vs gauge), cap-69, confidence band, next-action ranking`
  - `feat: scoreProjectState + deterministic next-action impact ranking`
- **Notes**: Dimensions (each `{ score 0-100, kind: blocker | gauge }`): **blockers** = installation,
  enforcement (per-runtime scoped — only a runtime that *declares* pretooluse yet fails caps),
  governance (owner+runtimes present). **gauges** = portability (runtimes verified / declared),
  activation (used / installed proxy; refine to should-have-fired later), efficacy (effective /
  installed), dx, performance (from `staticTokens` outliers). Global = gauge-weighted mean, then
  `min(69, …)` if any blocker is red. Confidence from effective-coverage + activation volume. Next
  actions computed from the largest closable gaps.

### Step B3 — `void status` command: gather, render, persist

- **Goal**: The terminal surface — gather local signals, compute state+score, render the spec §6
  mockup, write `.void/state.json` + `.void/history/<ts>.json`.
- **Depends on**: B1, B2
- **TDD mode**: souple (rendering + I/O glue over a unit-tested pure core)
- **Verification gate**: `node packages/cli/bin/void-harness.mjs status` prints the health header +
  dimensions + capabilities + next actions on this repo; `.void/state.json` is written and re-reads to
  the same shape; running twice with no telemetry change yields an identical `state.json` (deterministic,
  no LLM, no network); `pnpm -r typecheck` + `pnpm lint` green.
- **Expected commits**:
  - `feat: void-harness status command — gather local signals, render, persist state.json`
  - `test: status renderer + signal-gather smoke on a fixture`
- **Notes**: New `commands/status.ts` + a `case 'status'` in `main.ts`. Resolve `certification.json`
  from source in the monorepo, from the bundled artifact for consumers (mirror the graph command's
  `BUNDLED_*` resolution). Runtime detection: claude if `CLAUDE.md`, codex if `AGENTS.md`, hermes when
  its marker exists. `generatedAt` stamped by the shell (keeps the core deterministic). History write
  is best-effort, never blocks the render.

## Checkpoint B — after Step B1

The pure five-state core is proven. Stop, run `harness:verification-before-completion`, surface the
diff for direction review before scoring (B2) and the surface (B3).

## Meta-rule reminders

- New conventions (ProjectState shape, `.void/state.json`) documented in `docs/ARCHITECTURE.md` in the
  same commit. The score model (blocker/gauge, cap-69) is a non-obvious decision → decisions-log entry.
- `state.json` schema is versioned (`schemaVersion`) like `certification.json`.

## Resume point

**Next step**: Phase B COMPLETE on `folpe/void-public-multiruntime-spec`. Next phase: C (public npx/MIT distribution) — or open the PR (Folpe's call).

**Completed** (each doctrine-critic + silent-failure-hunter reviewed; every finding fixed in TDD; all gates green):
- ✅ B1: computeProjectState five-state core (`250ce6c`). Fixed a NaN-promotes-to-effective hole.
- ✅ B2: scoreProjectState (`5ab0da1`). Blocker/gauge, cap-69 on red predicate, pending excluded, confidence floor, next-actions from gauges. Fixed pct(x,0) false-0 + 1-sample high-confidence. ADR: score model.
- ✅ B3: `void-harness status` command (`b38bb3e`). Gather → compute → score → render → persist .void/state.json (+ pruned history). Fixed false "state written" on read-only .void + bare-name usage collision + help entry. Runs E2E on this repo: 63/100, confidence low (0 effective — honest), installation/dx pending.

**Deferred to Phase C** (ADR-noted): consumer bundled-certificate resolution + pack-aware `installed` filtering.
