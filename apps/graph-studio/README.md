# graph-studio

Interactive 3D view of the void-harness component graph (the maintainer/structure
surface, spec §7), rendered as a **holographic HUD console** (JARVIS / Iron Man /
Alita): bloom-lit neon nodes floating in a fogged void, an ambient particle field,
a lock-on targeting reticle, glassmorphic panels with animated corner brackets, and
a boot sequence. Renders `packages/harness-graph/model.json` with 3d-force-graph
(Three.js + d3-force), GSAP for choreography, and a static prebuild that runs the
kernel's `analyze()` for the analysis overlays.

Repo-internal, **not published** (private workspace app, absent from version lockstep).
Aesthetic respects `prefers-reduced-motion` (skips intro + pulsing).

## Run

```bash
pnpm --filter @voidcorp/harness-graph build   # kernel dist (the prebuild imports analyze)
pnpm --filter @voidcorp/graph-studio dev       # predev regenerates src/generated/, then Vite serves
```

## How data flows

`scripts/prepare-data.ts` (Node, run by tsx in predev/prebuild) reads `model.json`
+ `.void/usage.log`, runs `analyze()`, extracts each workflow's `meta.phases`, and
writes four gitignored blobs into `src/generated/`. The browser bundle is a pure
renderer of those blobs (no `node:fs`, no kernel runtime import).

## Layers

- **Structure** -- nodes (size = lines, color = type, clustered by pack); edges filterable by the four families.
- **Analysis** -- conflict halos, muted orphans, hole markers, overlap tension edges (from `analyze()` findings).
- **Flow** -- GSAP particle impulse along `routes-to`/`composes` ("Play flow").
- **Workflows** -- click a `workflow-def` for its phase schematic + neighbors (run replay is P2).

## Boundaries

Pure core (`src/scene/*`, `src/data/summarize.ts`, `src/data/extract-meta.ts`,
`src/ui/state.ts`) is unit-tested. Three.js/GSAP/DOM (`src/render/*`, `src/ui/*`)
is the imperative shell, verified by `vite build` + manual run (no WebGL unit tests).
