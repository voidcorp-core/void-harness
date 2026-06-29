# graph-studio

Interactive 3D view of the void-harness component graph (the maintainer/structure
surface, spec §7), rendered as a **holographic HUD console** (JARVIS / Iron Man /
Alita): bloom-lit neon nodes in a fogged void, an ambient particle field, a lock-on
reticle, glassmorphic panels, and a boot sequence. Renders
`packages/harness-graph/model.json` with 3d-force-graph (Three.js), GSAP for
choreography, and a static prebuild that runs the kernel's `analyze()` for the
analysis overlays.

Repo-internal, **not published** (private workspace app, absent from version lockstep).
Aesthetic respects `prefers-reduced-motion` (skips intro + pulsing + gravitation).

## View model: orchestrator-centric, progressive disclosure

The graph is organised around the thing that actually articulates the harness --
the orchestrator (**CLAUDE.md** / the routing doctrine) -- not a flat force-cloud:

- **Centre**: a `CLAUDE.md` orchestrator node.
- **Orbit (3D volume)**: one hub per group -- `core` plus each pack -- distributed
  on a sphere around the orchestrator (the whole scene gravitates slowly).
- **Progressive disclosure**: components are collapsed by default, so the overview
  is ~8 labelled hubs each carrying a count badge (e.g. `core (68)`, `pack-pwa (4)`).
  **Click a hub** to expand its components (orbiting that hub); click again to collapse.
- **Focus**: **click a component** to isolate its ego-network -- the focused node at
  centre, its `routes-to` / `composes` / `invokes` neighbours around it with
  directional arrows, everything else hidden. **Click the background** to return to
  the overview. This is the "how does this connect" view.
- **Edges**: a dim containment skeleton (orchestrator -> hub -> component) plus the
  real semantic edges. In the overview, semantic edges resolve to hub proxies so
  cross-group routing stays legible even while groups are collapsed.

## Run

```bash
pnpm --filter @voidcorp/harness-graph build   # kernel dist (the prebuild imports analyze)
pnpm --filter @voidcorp/graph-studio dev       # predev regenerates src/generated/, then Vite serves
```

Open the served URL in a real browser (WebGL needs a GPU; headless CI cannot render it).

## How data flows

`scripts/prepare-data.ts` (Node, run by tsx in predev/prebuild) reads `model.json`
+ `.void/usage.log`, runs `analyze()`, extracts each workflow's `meta.phases`, and
writes four gitignored blobs into `src/generated/`. The browser bundle is a pure
renderer of those blobs (no `node:fs`, no kernel runtime import).

## Layers (HUD toggles)

- **Structure** -- the orbital articulation: hubs, components (when expanded), and
  the semantic edges, filterable by the four edge families.
- **Analysis** -- conflict halos, muted orphans, hole markers, overlap tension edges
  (from `analyze()` findings).
- **Flow** -- travelling particles along routing edges (`routes-to` / `composes`);
  the "Play flow" button emits a one-shot wavefront burst on top.
- **Workflows** -- when on, clicking a `workflow-def` opens its phase schematic +
  neighbours (run replay is P2); when off it reads as a normal node.

## Boundaries

Pure core (`src/scene/*` incl. `articulation.ts`, `src/data/summarize.ts`,
`src/data/extract-meta.ts`, `src/ui/state.ts`) is unit-tested. Three.js/GSAP/DOM
(`src/render/*`, `src/ui/*`) is the imperative shell, verified by `vite build` +
manual run (no WebGL unit tests, per spec §11).
