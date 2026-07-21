---
title: Phase A — Capability contract + certification manifest
date: 2026-07-21
status: in-progress
spec: docs/specs/2026-07-21-void-harness-public-multiruntime-os.md
author: Folpe + Claude
high_risk: false
---

## Goal

Give every void-harness skill a structured **capability contract** (authored as SKILL.md
frontmatter, the pattern `activation`/`triggers` already use) and build a **frozen certification
manifest** into the release artifact. This is Phase A of the north-star spec: no consumer behavior
changes yet, but the harness now carries machine-readable capability identity, declared runtimes,
per-runtime enforcement tiers, owner (governance), eval targets, and a proof record derived from the
existing eval-harness. It is the data ProjectState / `void status` (Phase B) will read.

Grounding facts (verified): frontmatter is parsed in `packages/harness-graph/src/derive/read-frontmatter.ts`
and threaded via `toNode` in `.../derive/nodes.ts` into `GraphNode` (`.../model/types.ts`); the model
artifact is `packages/harness-graph/model.json`, written by `packages/cli/src/commands/graph.ts`. Eval
reports (`apps/eval-harness/src/types.ts` `EvalReport` with `delta` + `verdict`) persist as markdown at
`apps/eval-harness/reports/<skill>.md`. The release bundle is baked by
`packages/cli/scripts/build-void-graph.ts` + `packages/cli/src/lib/build-bundle.ts` (esbuild `define:
__VOID_BUNDLED_MODEL__`). No `owner` or `capability` field exists today (greenfield). Vitest, colocated
`*.test.ts`.

**Design decision (locked):** the capability contract is authored as **SKILL.md frontmatter fields**,
not a sibling `capability.yaml` — it matches the existing `activation`/`triggers`/`description`
parsing and needs no new file discovery. Source of truth is `packages/core/skills/**` and
`packages/packs/*/skills/**`; the `core-assets` copy follows via the existing sync.

## Steps

### Step A1 — `owner` field end-to-end + governance blocker (the thin pipe, MVP)

- **Goal**: Prove the whole pipe with one required field — frontmatter → kernel → model.json → a
  governance check that fails closed when a capability has no owner.
- **Depends on**: none
- **TDD mode**: strict (new parsing + new check logic)
- **Verification gate**: `pnpm --filter @voidcorp/harness-graph test` green for `read-frontmatter`,
  `nodes`, and the new governance predicate; a fixture skill with no `owner` makes the governance
  check exit non-zero; `pnpm graph:check` still passes on the real tree after backfill.
- **Expected commits**:
  - `test: owner frontmatter parsing + governance blocker on missing owner`
  - `feat: parse skill owner into GraphNode and gate it in graph check`
  - `chore: backfill owner on all core + pack skills`
- **Notes**: Add `parseOwner` in `read-frontmatter.ts`; add `owner?: string` to `GraphNode`
  (`model/types.ts`) parallel to `activation`; thread through `toNode` (`nodes.ts`). Governance
  predicate lives beside the existing `graph` audit logic (`packages/cli/src/commands/graph.ts` /
  the harness-graph audit module) as a new blocker class. Backfill value: `owner: folpe` on all 36
  core + pack skills (single accountable maintainer today). Regenerate `model.json` via the CLI
  `--refresh` path and commit the drift.

### Step A2 — `runtimes` + `enforcement` fields + governance requires runtimes

- **Goal**: Declare, per capability, which runtimes it supports and its per-runtime enforcement tier.
- **Depends on**: A1
- **TDD mode**: strict
- **Verification gate**: parsing tests for a list `runtimes` and a nested `enforcement` map green;
  governance now also fails a capability with empty/absent `runtimes`; `model.json` node carries both
  fields; `pnpm graph:check` passes on the backfilled tree.
- **Expected commits**:
  - `test: runtimes list + enforcement map parsing and runtimes governance gate`
  - `feat: parse runtimes + per-runtime enforcement into GraphNode + gate`
  - `chore: backfill runtimes + enforcement on all skills`
- **Notes**: `enforcement` shape (spec §2): `{ floor: ci, inline: { claude, codex, hermes } }` with
  tier values `pretooluse | active | ci-only | n/a`. Backfill rule (deterministic, no guessing):
  `floor: ci` for all; `inline.claude`/`inline.codex` = `pretooluse` for a skill that is the target
  of an existing `enforces` edge in the graph model, else `active`; `inline.hermes: ci-only`
  everywhere (Fork 1). `runtimes: [claude, codex]` default (Hermes added in Phase G). Reuse the
  `enforces` edges already in `model.json` to derive the pretooluse set — do not hand-classify.

### Step A3 — `evals.targets` + `success_signal` + id/version derivation

- **Goal**: Complete the authored contract — the declared eval target cells and the human-readable
  success signal — and derive `id` + `version` at build (not hand-authored).
- **Depends on**: A2
- **TDD mode**: souple (parsing over covered kernel seams; id/version are derivations, not new
  business rules)
- **Verification gate**: parsing tests for `evals.targets` (list of `{runtime, provider, tier}`) and
  `success_signal` green; `model.json` node exposes `id` (= existing `nodeId`) and a `version` field
  stamped from the harness version at assembly; `pnpm graph:check` green.
- **Expected commits**:
  - `test: evals.targets + success_signal parsing; version stamping in assembleModel`
  - `feat: capability id/version derivation + eval-target frontmatter`
  - `chore: backfill evals.targets + success_signal on all skills`
- **Notes**: `id` already exists as `nodeId` (`skill:<name>` / `skill:<pack>/<name>`); expose it on
  the node explicitly. `version` = harness lockstep version, read in `build-model.ts`
  (`assembleModel`). Backfill `evals.targets` default: `[{ runtime: claude, provider: anthropic, tier:
  opus }]` (adjust `tier: sonnet` for the cheaper skills per spec). `success_signal` authored per
  skill from its SKILL.md intent (one line each).

### Step A4 — certification manifest build + freeze into the release bundle

- **Goal**: Emit a frozen per-release `certification.json` (the manifest ProjectState reads in Phase
  B) from the capability fields + eval reports, and bake it into the shipped bundle.
- **Depends on**: A1, A2, A3
- **TDD mode**: strict for the pure builder (functional core), souple for the esbuild bake wiring
- **Verification gate**: `pnpm --filter @voidcorp/harness-graph test` green for the pure
  `buildCertification(model, evalReports)`; a golden test asserts a capability with a passing
  `EvalReport` gets `proof.effective` with its cell/delta and one without gets only `proof.verified`;
  the drift check `pnpm graph:check-bundle` (extended) fails when `certification.json` is stale; full
  `pnpm build` bakes `__VOID_BUNDLED_CERTIFICATION__` without error.
- **Expected commits**:
  - `test: buildCertification maps eval verdicts to proof records`
  - `feat: certification manifest builder + committed certification.json artifact`
  - `feat: emit EvalReport JSON alongside markdown in eval-harness`
  - `feat: bake certification into void-graph bundle + freshness CI gate`
- **Notes**: Add a JSON emitter to `apps/eval-harness/src/cli.ts` writing
  `apps/eval-harness/reports/<skill>.json` from the `EvalReport` object (source of `proof.effective`;
  do not parse markdown). Builder maps `verdict: skill-helps` → `proof.effective.cells[]` with
  `{runtime, provider, tier, delta, confidence}`; `no-signal`/`skill-hurts`/absent → no `effective`,
  `verified` only. Emit committed artifact `packages/harness-graph/certification.json` mirroring
  `model.json`, written by the CLI `graph` command; bake it via a third esbuild `define`
  (`__VOID_BUNDLED_CERTIFICATION__`) in `build-bundle.ts` + `build-void-graph.ts`. Add a CI gate
  mirroring the existing `graph:check-bundle` (ARCHITECTURE.md CI table). **Honesty invariant**: only
  a real passing `EvalReport` produces `proof.effective`; no capability may carry a proof it lacks
  (spec §2 governance) — assert this in the builder test.

## Checkpoint A — after Step A1

The thin pipe (frontmatter → model → governance gate) is proven on one field. Stop, run
`harness:verification-before-completion`, and surface the real diff for direction review before
broadening the contract in A2–A4. (Folpe reviews on diffs, not plans.)

## Meta-rule reminders (block CI if missed)

- New conventions (the capability frontmatter fields) MUST be documented in `docs/ARCHITECTURE.md`
  (the frontmatter section) **in the same commit** that introduces them.
- The 2026-07-09 supersession and the capability contract are non-obvious → the ADRs listed in spec
  §9 (#1–#7) get dated `docs/decisions-log/` entries; Phase A lands at minimum ADR #2 (two-tier
  enforcement) and the capability-contract decision. Run `pnpm decisions:build`.
- Versions are release-please-owned; do not hand-edit manifests.

## Resume point

**Next step**: Step A2 (runtimes + enforcement) — awaiting direction review at Checkpoint A.

**Completed**:
- ✅ A1: owner field end-to-end + fail-closed missing-owner governance (commit `feat(graph): capability owner field + fail-closed missing-owner governance`). 129 harness-graph tests green, typecheck/lint/graph:check/check-bundle green, doctrine-critic PASS, silent-failure-hunter found + fixed a vacuous-owner governance hole.

**Pending**:
- ⏳ A2: runtimes + enforcement (apply doctrine-critic nit: extract `parseScalar(block, key)` when a third scalar field lands)
- ⏳ A3: evals.targets + success_signal + id/version
- ⏳ A4: certification manifest build + bundle freeze
