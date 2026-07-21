---
title: Phase C — public MIT distribution (npx-primary)
date: 2026-07-21
status: in-progress
spec: docs/specs/2026-07-21-void-harness-public-multiruntime-os.md
author: Folpe + Claude
high_risk: false
---

## Goal

Make void-harness installable free and account-free via `npx @voidcorp/harness`, reversing the
2026-07-09 marketplace-only decision (Fork 2). The npm package `@voidcorp/harness` is already
publish-configured (`publishConfig.access: public`, `bin`, MIT LICENSE) — the block was a decision,
not a lock. Phase C makes the package **self-sufficient** (a published tarball can run `status`
without the monorepo), flips the docs to lead with npx, records the superseding ADR, and adds the
tier-1 adoption pull.

**Reversible, in-repo scope only.** This plan does NOT run `npm publish` (outward-facing, irreversible,
needs the org) nor build the signed-binary GitHub Releases pipeline (release-ops). Those are
Folpe-triggered / release-please follow-ups. Everything here is config, code, and docs verifiable in
the repo (including `npm pack --dry-run`).

Grounding (verified): `packages/cli/package.json` has `publishConfig.access: public`, `bin`, `files:
[bin, dist, core-assets, README.md]` — but NOT `certification.json`/`model.json`, which `status.ts`
currently reads from `packages/harness-graph/` (monorepo-only). `scripts/check-publish-safety.mjs`
(`pnpm check:publish`) already gates workspace-specifier leaks. LICENSE is MIT. README + `help.ts`
lead with the marketplace and call npm "deliberately not wired".

## Steps

### Step C1 — Public MIT decision + docs flip (npx-primary)

- **Goal**: Make the public stance official — the superseding ADR, README + help leading with npx,
  marketplace demoted to an optional Claude-Code convenience.
- **Depends on**: none
- **TDD mode**: n/a (docs) — self-review + `pnpm sync:docs` parity
- **Verification gate**: `pnpm decisions:check` + `pnpm sync:docs` green; README + `help.ts` lead with
  `npx @voidcorp/harness`; a new `docs/decisions-log/` entry supersedes 2026-07-09; no doc still calls
  npm "deliberately not wired".
- **Expected commits**:
  - `docs: flip distribution to public MIT npx-primary; ADR supersedes 2026-07-09`
- **Notes**: The ADR states the changed premise (the CLI/status *becomes* the product; account-free
  install is a non-negotiable the marketplace cannot satisfy; moat stays in private sibling repos +
  the telemetry flywheel). Marketplace stays documented as a secondary channel for Claude-Code users.

### Step C2 — Self-sufficient CLI package (status runs from a published tarball)

- **Goal**: A published `@voidcorp/harness` can run `status` with no monorepo — ship
  `certification.json` + `model.json` inside the package and resolve them package-locally.
- **Depends on**: C1
- **TDD mode**: souple (a pure path-resolution helper is tested; the copy step is build glue)
- **Verification gate**: `pnpm --filter @voidcorp/harness build:assets` copies `certification.json` +
  `model.json` into the shipped `core-assets/`; a pure `resolveDataPath` prefers the package-local
  copy when the monorepo source is absent; `npm pack --dry-run` shows both files in the tarball and
  `pnpm check:publish` stays green (no workspace leak); `node bin/void-harness.mjs status` still works
  in-repo.
- **Expected commits**:
  - `test: package-local data resolution for a published CLI`
  - `feat: ship certification.json + model.json in the CLI tarball; resolve package-local`
- **Notes**: Extend `scripts/copy-core-assets.mjs` (or add to `build:assets`) to copy the two JSON
  artifacts into `packages/cli/core-assets/data/`. `status.ts` resolves: monorepo source first
  (`packages/harness-graph/*.json`), else the package-local `core-assets/data/*.json`. Same
  resolution graph.ts uses for bundled vs source. This also clears the A4/B3 deferral (consumer cert
  access) without baking into the 1.9 MB graph bundle.

### Step C3 — `void adoption` (tier-1 telemetry pull)

- **Goal**: A maintainer command that *pulls* public adoption stats (npm downloads + GitHub Releases
  downloads / stars) — zero phone-home, answers "who downloads".
- **Depends on**: C1
- **TDD mode**: souple (pure URL-building + response-parsing tested; the fetch is glue)
- **Verification gate**: pure `npmDownloadsUrl` / `parseNpmDownloads` / `parseGithubStats` unit-tested;
  `node bin/void-harness.mjs adoption` runs (returns real numbers once published, a clear "not yet
  published / no data" otherwise); wired into `main.ts` + help.
- **Expected commits**:
  - `test: adoption stat URL-building + response parsing`
  - `feat: void-harness adoption — pull npm + GitHub download stats (tier-1, opt-in-free)`
- **Notes**: npm downloads API (`api.npmjs.org/downloads/point/last-month/@voidcorp/harness`) and the
  GitHub API (releases + repo stars) are public, no auth for read. Tier-2 (opt-in install ping) and
  tier-3 (usage aggregates) stay deferred (ADR 2026-07-21 telemetry).

## Checkpoint C — after Step C1

The public stance is on record. Stop, confirm the docs direction, before the packaging (C2) and the
adoption command (C3).

## Deferred (Folpe-triggered / release-ops, explicitly out of this plan)

- Actual `npm publish` of `@voidcorp/harness` (+ release-please wiring to publish on release).
- Signed standalone binary via GitHub Releases (build matrix + signing).
- Tier-2 / tier-3 telemetry.

## Resume point

**Next step**: Step C1 (public MIT decision + docs flip)

**Completed**: none (Phases A + B complete — see their plans)

**Pending**:
- ⏳ C1: docs flip + superseding ADR
- ⏳ C2: self-sufficient CLI package
- ⏳ C3: void adoption command
