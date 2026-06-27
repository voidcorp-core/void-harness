# harness-graph studio (apps/graph-studio) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/graph-studio` — a Vite + TypeScript web app that renders `packages/harness-graph/model.json` as an interactive 3D graph (3d-force-graph / Three.js), with analysis overlays, a structural-flow animation (GSAP), a workflow-def viewer, a side panel, and layer/family/search filters. This is **Plan B** (spec §7); Plan A (the kernel) is merged.

**Architecture:** Functional core / imperative shell, mirroring the kernel. A Node **prebuild** script (`scripts/prepare-data.ts`, run by `tsx`) reads the committed `model.json` + `.void/usage.log`, runs the kernel's already-exported `analyze()` to produce findings, extracts each workflow-def's `meta.phases`, and writes four static JSON blobs into a gitignored `src/generated/`. The browser app is then a **pure renderer of those blobs** — zero `node:fs` in the bundle, zero edits to the merged kernel package. The renderer splits into a **pure scene core** (`src/scene/*` — model→scene transforms, unit-tested with vitest) and an **imperative render/UI shell** (`src/render/*`, `src/ui/*` — Three.js/GSAP/DOM, verified by `vite build` + manual run, never WebGL-unit-tested, per spec §11).

**Tech Stack:** Vite 5 + TypeScript (strict), `3d-force-graph` (wraps Three.js + d3-force), `gsap` (camera, particle bursts, layer transitions), `d3-scale` (visual encoding), `tsx` (run the TS prebuild script), vitest (pure-core tests), biome (lint). The kernel `@voidcorp/harness-graph` is a `workspace:*` **devDependency** used only by the Node prebuild script.

## Design Language — Holographic HUD (JARVIS / Iron Man / Alita)

The studio is not a neutral chart; it is a **cinematic command console**. The graph
floats in a dark void as a glowing hologram, framed by a translucent HUD. This
aesthetic is established by Task 12 (the holographic pass) and pre-baked into the
CSS/HTML from Task 1/8 so the look is coherent from the first render. Borrowed from
`patoles/agent-flow` ("Holographic Edition": bloom renderer, glass cards, glow) and
pushed further into sci-fi HUD territory.

**Palette (tokens, used in both CSS and WebGL materials):**

| Token | Hex | Use |
| --- | --- | --- |
| `--void` | `#04060d` | background / deep space |
| `--void-2` | `#0a0f1c` | panel base (with blur) |
| `--holo-cyan` | `#36e0ff` | primary hologram, edges, reticle, HUD chrome |
| `--holo-teal` | `#5eead4` | skill nodes, routing edges |
| `--holo-amber` | `#ffb547` | secondary accent (Iron Man), highlights, callouts |
| `--holo-violet` | `#a78bfa` | agents |
| `--alert` | `#ff4d6d` | conflicts / cycles |
| `--ink` | `#cfefff` | HUD text (cool white) |
| `--ink-dim` | `#6f8aa6` | secondary text |

**Pillars:**
1. **Glow is the medium.** Neon node/edge colors are made emissive and bloom-lit
   (UnrealBloomPass) so the graph reads as projected light, not painted geometry.
2. **Depth into the void.** Scene fog + vignette dim distant nodes into black; a
   slow-rotating ambient particle field (dust/stars) gives parallax and life.
3. **Targeting, not selecting.** Clicking/hovering a node snaps an animated
   **reticle** (corner brackets + rotating ring) onto it; the side panel reads like
   a target dossier, tied to the node by a glowing leader line feel (color match).
4. **HUD chrome, not chrome chrome.** Panels are glassmorphic (blur + thin cyan
   border + outer glow), stamped with **animated corner brackets**, a faint moving
   **scanline**, and an Orbitron/Rajdhani display face for headers (monospace for data).
5. **It boots.** On load, a one-time sequence: camera sweeps in, nodes fade/scale up
   with stagger, a "SYSTEM ONLINE" shimmer. Motion stays <250ms per UI transition;
   the intro is the one allowed longer cinematic beat (~1.5s).
6. **Restraint under the spectacle.** Effects never bury the data: legibility,
   contrast (cool white on void), and the analysis signals win over flourish. No
   strobe; respect `prefers-reduced-motion` (skip intro + pulse for those users).

Optional stretch (off by default, not a required step): a WebAudio ambient drone +
soft UI blips behind a HUD toggle, for the full JARVIS feel.

## Global Constraints

- pnpm `9.15.9`; Node `>=20`; package `"type": "module"`; bundler resolution (`moduleResolution: "Bundler"`).
- TypeScript strict (inherits `packages/packs/pack-monorepo/tsconfig.strict.json`): zero `any`, discriminated unions over enums, `satisfies` over `as`, exhaustive switches via `never`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` (use `import type` for type-only imports).
- Functional core / imperative shell: everything in `src/scene/`, `src/data/summarize.ts`, `src/data/extract-meta.ts`, `src/ui/state.ts` is **pure** (no I/O, no DOM, no Three.js) and unit-tested. All Three.js / GSAP / DOM / `node:fs` lives in `src/render/`, `src/ui/*` (DOM), `scripts/prepare-data.ts`, and is **not** unit-tested (smoke build only).
- Source-driven: before writing any `3d-force-graph` / `gsap` / `three` call, read that library's official docs **for the installed version** (run `pnpm why <lib>` / open `node_modules/<lib>/README.md`). The imperative code below is a faithful starting point; reconcile any API drift against the installed version, never against memory.
- Conventional commits; every body ends with the **why**. ASCII only (no em dash, no emoji as filler). Co-author trailer for the AI pair.
- Determinism: the prebuild emits stably-ordered JSON; pure transforms are order-stable (sort by id). No `Date.now()` / `Math.random()` in pure code.
- `apps/graph-studio` is **private, never published, not in version lockstep** (it is absent from `scripts/check-version-lockstep.mjs` and `release-please-config.json` on purpose). Its `package.json` carries no meaningful version (`"0.0.0"`, `"private": true`). `workspace:*` is allowed (it is not an npm-published package, so `check:publish` does not scan it).
- The app is **exempt from the 400-line skill cap** (it is an app, not a skill) but every file stays small and single-responsibility (spec §13).

---

### Task 1: Scaffold the app + wire it into the workspace/tooling

**Files:**
- Create: `apps/graph-studio/package.json`
- Create: `apps/graph-studio/tsconfig.json`
- Create: `apps/graph-studio/vite.config.ts`
- Create: `apps/graph-studio/index.html`
- Create: `apps/graph-studio/.gitignore`
- Create: `apps/graph-studio/scripts/prepare-data.ts` (minimal placeholder; Task 2 fills it)
- Create: `apps/graph-studio/src/main.ts` (placeholder)
- Create: `apps/graph-studio/src/smoke.test.ts`
- Create: `apps/graph-studio/src/vite-env.d.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `vitest.config.ts`
- Modify: `biome.json`

**Interfaces:**
- Produces: a buildable, lintable, type-checkable workspace package `@voidcorp/graph-studio` that `pnpm -r` build/typecheck and the root `vitest`/`biome` pick up automatically.

- [ ] **Step 1: Add the app glob to `pnpm-workspace.yaml`**

The file currently lists `packages/cli`, `packages/packs/*`, `packages/harness-graph`. Add an `apps/*` glob:

```yaml
# Workspaces for pnpm.
#
# packages/core/ is intentionally NOT a workspace: it holds static assets
# (claude/{skills,agents,hooks,modules}) consumed by the CLI at install time,
# not a published npm package.
packages:
  - 'packages/cli'
  - 'packages/packs/*'
  - 'packages/harness-graph'
  - 'apps/*'
```

- [ ] **Step 2: Extend the root `vitest.config.ts` include to cover apps**

The root config currently includes `['test/**/*.test.ts', 'packages/**/*.test.ts']`. Add the apps glob so the pure-core tests run in the single root suite:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: false,
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 3: Extend `biome.json` includes to lint the app**

Biome's `files.includes` currently only matches `packages/**`. Add the apps source + config + scripts globs (keep every existing ignore):

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.16/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": true,
    "includes": [
      "packages/**/src/**/*.ts",
      "packages/**/*.config.ts",
      "apps/**/src/**/*.ts",
      "apps/**/scripts/**/*.ts",
      "apps/**/*.config.ts",
      "test/**/*.ts",
      "!**/node_modules",
      "!**/dist",
      "!**/templates",
      "!**/generated",
      "!**/*.d.ts"
    ]
  },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "single" } },
  "formatter": { "enabled": false }
}
```

- [ ] **Step 4: Write `apps/graph-studio/package.json`**

```json
{
  "name": "@voidcorp/graph-studio",
  "version": "0.0.0",
  "private": true,
  "description": "void-harness graph studio — interactive 3D view of the skill/agent/hook/pack/workflow graph (renders harness-graph model.json). Repo-internal, not published.",
  "type": "module",
  "scripts": {
    "prepare-data": "tsx scripts/prepare-data.ts",
    "predev": "pnpm run prepare-data",
    "dev": "vite",
    "prebuild": "pnpm run prepare-data",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "3d-force-graph": "^1.73.0",
    "d3-scale": "^4.0.2",
    "gsap": "^3.12.5",
    "three": "^0.171.0"
  },
  "devDependencies": {
    "@types/d3-scale": "^4.0.8",
    "@types/node": "^22.0.0",
    "@types/three": "^0.171.0",
    "@voidcorp/harness-graph": "workspace:*",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

Note: the exact patch versions resolve at install. If pnpm reports a peer conflict between `vite@5` and `vitest@2`, keep `vite@^5` (vitest 2 pairs with vite 5). Consult each package's README after install (source-driven).

- [ ] **Step 5: Write `apps/graph-studio/tsconfig.json`**

Extends the repo strict base, adds DOM + Vite client types + Node types (for the prebuild script), and disables emit (Vite builds):

```json
{
  "extends": "../../packages/packs/pack-monorepo/tsconfig.strict.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src", "scripts", "vite.config.ts"]
}
```

If `../../packages/packs/pack-monorepo/tsconfig.strict.json` is not resolvable from here, run `cat packages/packs/pack-monorepo/tsconfig.strict.json` and inline its `compilerOptions` instead.

- [ ] **Step 6: Write `apps/graph-studio/vite.config.ts`**

```ts
import { defineConfig } from 'vite';

// Relative base so the built static app can be opened from any path
// (it is a repo-internal tool, served from disk or a static host, no router).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
```

- [ ] **Step 7: Write `apps/graph-studio/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: Write `apps/graph-studio/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>void-harness // graph studio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Rajdhani:wght@500;600&display=swap" />
    <style>
      :root {
        --void: #04060d; --void-2: #0a0f1c; --holo-cyan: #36e0ff; --holo-teal: #5eead4;
        --holo-amber: #ffb547; --holo-violet: #a78bfa; --alert: #ff4d6d;
        --ink: #cfefff; --ink-dim: #6f8aa6;
      }
      html, body { margin: 0; height: 100%; background: var(--void); color: var(--ink); font: 13px/1.5 ui-monospace, 'Rajdhani', monospace; overflow: hidden; }
      #scene { position: fixed; inset: 0; cursor: crosshair; }
      /* Faint global vignette so the void deepens at the edges. */
      body::after { content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 5;
        background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%); }
    </style>
  </head>
  <body>
    <div id="scene"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Note: the Google Fonts link is the one external network dependency, used only for the HUD display face (Orbitron/Rajdhani). If the studio must run fully offline, self-host the woff2 files under `public/fonts/` and `@font-face` them in `src/ui/styles.css` instead; the layout degrades gracefully to `ui-monospace` if the fonts fail to load.

- [ ] **Step 9: Write `apps/graph-studio/.gitignore`**

```gitignore
dist
src/generated
```

- [ ] **Step 10: Write the minimal placeholder `apps/graph-studio/scripts/prepare-data.ts`**

This placeholder copies the model and writes empty companions so the build is green before Task 2 wires the real pipeline:

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = resolve(here, '../src/generated');

mkdirSync(outDir, { recursive: true });
const model = readFileSync(resolve(repoRoot, 'packages/harness-graph/model.json'), 'utf8');
writeFileSync(resolve(outDir, 'model.json'), model);
writeFileSync(resolve(outDir, 'usage-summary.json'), `${JSON.stringify({ counts: {}, usedSkillNames: [] }, null, 2)}\n`);
writeFileSync(resolve(outDir, 'findings.json'), `${JSON.stringify([], null, 2)}\n`);
writeFileSync(resolve(outDir, 'workflows.json'), `${JSON.stringify({}, null, 2)}\n`);
process.stdout.write('prepare-data: wrote 4 generated files\n');
```

- [ ] **Step 11: Write the placeholder `apps/graph-studio/src/main.ts`**

```ts
import model from './generated/model.json' with { type: 'json' };

const el = document.getElementById('scene');
if (el) {
  el.textContent = `harness-graph: ${model.nodes.length} nodes, ${model.edges.length} edges`;
}
```

- [ ] **Step 12: Write the smoke test `apps/graph-studio/src/smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

describe('graph-studio scaffold', () => {
  it('runs the suite', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 13: Install, generate data, build, typecheck, lint, test**

```bash
pnpm install
pnpm --filter @voidcorp/harness-graph build   # prebuild needs the kernel's dist (Task 2); harmless now
pnpm --filter @voidcorp/graph-studio prepare-data
pnpm --filter @voidcorp/graph-studio build
pnpm --filter @voidcorp/graph-studio typecheck
pnpm vitest run apps/graph-studio
pnpm lint
```

Expected: install succeeds; `prepare-data` writes 4 files into `src/generated/`; `vite build` emits `dist/`; typecheck clean; smoke test passes; biome reports no errors for the new files.

- [ ] **Step 14: Commit**

```bash
git add apps/graph-studio pnpm-workspace.yaml vitest.config.ts biome.json pnpm-lock.yaml
git commit -m "feat(graph-studio): scaffold the Vite + TS app and wire it into the workspace

Why: Plan B needs a buildable, lintable, type-checked app shell that the
root tooling (pnpm -r, vitest, biome) picks up before any rendering logic
lands; the prebuild-to-static-JSON seam keeps node:fs out of the bundle."
```

---

### Task 2: Real data pipeline — usage summary, meta extraction, kernel analysis

**Files:**
- Create: `apps/graph-studio/src/data/summarize.ts`
- Create: `apps/graph-studio/src/data/summarize.test.ts`
- Create: `apps/graph-studio/src/data/extract-meta.ts`
- Create: `apps/graph-studio/src/data/extract-meta.test.ts`
- Create: `apps/graph-studio/src/data/types.ts`
- Modify: `apps/graph-studio/scripts/prepare-data.ts`

**Interfaces:**
- Consumes: `@voidcorp/harness-graph` exports `analyze`, and types `GraphModel`, `Finding`, `AnalyzeCtx`.
- Produces (pure): `summarizeUsage(logText: string): UsageSummary` where `UsageSummary = { counts: Record<string, number>; usedSkillNames: string[] }`; `extractMeta(text: string): WorkflowMeta` where `WorkflowMeta = { phases: { title: string; detail?: string }[] }`.
- Produces (data contract for the renderer): `src/generated/{model.json, usage-summary.json, findings.json, workflows.json}`. `workflows.json` is `Record<nodeId, WorkflowMeta>`.

- [ ] **Step 1: Write `apps/graph-studio/src/data/types.ts`**

```ts
export interface UsageSummary {
  readonly counts: Record<string, number>;
  readonly usedSkillNames: readonly string[];
}

export interface WorkflowPhase {
  readonly title: string;
  readonly detail?: string;
}

export interface WorkflowMeta {
  readonly phases: readonly WorkflowPhase[];
}
```

- [ ] **Step 2: Write the failing test `apps/graph-studio/src/data/summarize.test.ts`**

`.void/usage.log` lines are `ISO-timestamp<TAB>name`, where `name` may carry a plugin prefix (`harness:tdd`) that must be stripped to the bare skill name (`tdd`).

```ts
import { describe, expect, it } from 'vitest';
import { summarizeUsage } from './summarize.js';

describe('summarizeUsage', () => {
  it('counts invocations per bare name and lists distinct used names', () => {
    const log = [
      '2026-06-20T10:00:00Z\ttdd',
      '2026-06-20T10:01:00Z\ttdd',
      '2026-06-20T10:02:00Z\tharness:code-review',
      '',
    ].join('\n');
    const s = summarizeUsage(log);
    expect(s.counts.tdd).toBe(2);
    expect(s.counts['code-review']).toBe(1);
    expect([...s.usedSkillNames].sort()).toEqual(['code-review', 'tdd']);
  });

  it('returns empty summary for empty input', () => {
    expect(summarizeUsage('')).toEqual({ counts: {}, usedSkillNames: [] });
  });

  it('ignores malformed lines without a tab', () => {
    expect(summarizeUsage('garbage-no-tab\n')).toEqual({ counts: {}, usedSkillNames: [] });
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm vitest run apps/graph-studio/src/data/summarize.test.ts`
Expected: FAIL — cannot find `./summarize.js`.

- [ ] **Step 4: Implement `apps/graph-studio/src/data/summarize.ts`**

```ts
import type { UsageSummary } from './types.js';

/** Strip an optional `plugin:` prefix, returning the bare component name. */
function bareName(raw: string): string {
  const colon = raw.lastIndexOf(':');
  return colon >= 0 ? raw.slice(colon + 1) : raw;
}

/** Summarize a `.void/usage.log` (lines: `ISO-ts<TAB>name`) into counts + distinct names. Pure. */
export function summarizeUsage(logText: string): UsageSummary {
  const counts: Record<string, number> = {};
  for (const line of logText.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const name = bareName(line.slice(tab + 1).trim());
    if (name === '') continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return { counts, usedSkillNames: Object.keys(counts).sort() };
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm vitest run apps/graph-studio/src/data/summarize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing test `apps/graph-studio/src/data/extract-meta.test.ts`**

Workflow scripts begin with `export const meta = { ... }` — a pure object literal (Workflow contract: no variables, calls, or interpolation). We extract just that literal; the side-effecting script body below it is never executed.

```ts
import { describe, expect, it } from 'vitest';
import { extractMeta } from './extract-meta.js';

describe('extractMeta', () => {
  it('reads phases (title + detail) from a meta literal', () => {
    const src = [
      "export const meta = {",
      "  name: 'demo',",
      "  description: 'd',",
      "  phases: [",
      "    { title: 'Scan', detail: 'grep logs' },",
      "    { title: 'Fix' },",
      "  ],",
      "};",
      "phase('Scan');",
      "const x = await agent('go');",
    ].join('\n');
    expect(extractMeta(src)).toEqual({ phases: [{ title: 'Scan', detail: 'grep logs' }, { title: 'Fix' }] });
  });

  it('returns empty phases when meta has none', () => {
    expect(extractMeta("export const meta = { name: 'x', description: 'y' };")).toEqual({ phases: [] });
  });

  it('returns empty phases when no meta is present', () => {
    expect(extractMeta('const notMeta = 1;')).toEqual({ phases: [] });
  });
});
```

- [ ] **Step 7: Run to confirm failure**

Run: `pnpm vitest run apps/graph-studio/src/data/extract-meta.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `apps/graph-studio/src/data/extract-meta.ts`**

Balance braces from `export const meta =` to find the literal, then evaluate it in an isolated `Function` (safe because the literal is pure by the Workflow contract). Any failure degrades to empty phases (tolerant, spec §10).

```ts
import type { WorkflowMeta, WorkflowPhase } from './types.js';

const EMPTY: WorkflowMeta = { phases: [] };

/** Extract `meta.phases` from a workflow script's `export const meta = {literal}`. Tolerant: returns empty on any failure. */
export function extractMeta(text: string): WorkflowMeta {
  const marker = text.indexOf('export const meta');
  if (marker < 0) return EMPTY;
  const open = text.indexOf('{', marker);
  if (open < 0) return EMPTY;
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return EMPTY;
  const literal = text.slice(open, end + 1);
  try {
    // The meta object is a pure literal (Workflow contract): safe to evaluate.
    const value = new Function(`return (${literal});`)() as { phases?: unknown };
    if (!Array.isArray(value.phases)) return EMPTY;
    const phases: WorkflowPhase[] = [];
    for (const p of value.phases) {
      if (p && typeof p === 'object' && typeof (p as { title?: unknown }).title === 'string') {
        const title = (p as { title: string }).title;
        const detail = (p as { detail?: unknown }).detail;
        phases.push(typeof detail === 'string' ? { title, detail } : { title });
      }
    }
    return { phases };
  } catch {
    return EMPTY;
  }
}
```

- [ ] **Step 9: Run to confirm pass**

Run: `pnpm vitest run apps/graph-studio/src/data/extract-meta.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 10: Rewrite `apps/graph-studio/scripts/prepare-data.ts` to wire the real pipeline**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '@voidcorp/harness-graph';
import type { GraphModel } from '@voidcorp/harness-graph';
import { extractMeta } from '../src/data/extract-meta.js';
import { summarizeUsage } from '../src/data/summarize.js';
import type { WorkflowMeta } from '../src/data/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = resolve(here, '../src/generated');

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

mkdirSync(outDir, { recursive: true });

const modelText = readFileSync(resolve(repoRoot, 'packages/harness-graph/model.json'), 'utf8');
const model = JSON.parse(modelText) as GraphModel;

const usage = summarizeUsage(readIfExists(resolve(repoRoot, '.void/usage.log')));
const findings = analyze(model, { usedSkillNames: new Set(usage.usedSkillNames) });

const workflows: Record<string, WorkflowMeta> = {};
for (const node of model.nodes) {
  if (node.type !== 'workflow-def') continue;
  const meta = extractMeta(readIfExists(resolve(repoRoot, node.source)));
  if (meta.phases.length > 0) workflows[node.id] = meta;
}

const write = (name: string, value: unknown): void => {
  writeFileSync(resolve(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
};
write('model.json', model);
write('usage-summary.json', usage);
write('findings.json', findings);
write('workflows.json', workflows);
process.stdout.write(
  `prepare-data: ${model.nodes.length} nodes, ${findings.length} findings, ${Object.keys(workflows).length} workflow metas\n`,
);
```

- [ ] **Step 11: Run the pipeline + the full local gate**

```bash
pnpm --filter @voidcorp/harness-graph build
pnpm --filter @voidcorp/graph-studio prepare-data
pnpm --filter @voidcorp/graph-studio typecheck
pnpm vitest run apps/graph-studio
```

Expected: `prepare-data` prints node/finding/workflow counts (102 nodes, several findings); typecheck clean; all data tests pass.

- [ ] **Step 12: Commit**

```bash
git add apps/graph-studio/src/data apps/graph-studio/scripts/prepare-data.ts
git commit -m "feat(graph-studio): build static model/usage/findings/workflows blobs

Why: running the kernel's analyze() once at prebuild (Node side) keeps the
analysis single-sourced and the browser bundle free of node:fs, while the
usage summary and extracted workflow phases feed the 3D encoding."
```

---

### Task 3: Pure scene encoding (size / color / halo / cluster)

**Files:**
- Create: `apps/graph-studio/src/scene/encode.ts`
- Create: `apps/graph-studio/src/scene/encode.test.ts`

**Interfaces:**
- Consumes: `NodeType` from `@voidcorp/harness-graph`; `UsageSummary` from `../data/types.js`.
- Produces: `sizeForLines(lines: number): number`; `colorForType(type: NodeType): string`; `haloForCount(count: number): number`; `clusterAnchor(index: number, total: number): { x: number; y: number; z: number }`; `TYPE_COLORS: Record<NodeType, string>`.

- [ ] **Step 1: Write the failing test `apps/graph-studio/src/scene/encode.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { clusterAnchor, colorForType, haloForCount, sizeForLines } from './encode.js';

describe('sizeForLines', () => {
  it('grows monotonically with line count and clamps the floor', () => {
    expect(sizeForLines(0)).toBeGreaterThanOrEqual(2);
    expect(sizeForLines(400)).toBeGreaterThan(sizeForLines(40));
    expect(sizeForLines(40)).toBeGreaterThan(sizeForLines(0));
  });
});

describe('colorForType', () => {
  it('maps every node type to a distinct hex color', () => {
    const colors = (['skill', 'agent', 'hook', 'command', 'pack', 'workflow-def'] as const).map(colorForType);
    expect(new Set(colors).size).toBe(colors.length);
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('haloForCount', () => {
  it('is 0 for never-used and saturates at 1', () => {
    expect(haloForCount(0)).toBe(0);
    expect(haloForCount(1)).toBeGreaterThan(0);
    expect(haloForCount(10_000)).toBeLessThanOrEqual(1);
    expect(haloForCount(50)).toBeGreaterThan(haloForCount(5));
  });
});

describe('clusterAnchor', () => {
  it('spreads anchors deterministically on a sphere-ish ring', () => {
    const a = clusterAnchor(0, 4);
    const b = clusterAnchor(1, 4);
    expect(a).not.toEqual(b);
    expect(clusterAnchor(0, 4)).toEqual(a); // deterministic
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run apps/graph-studio/src/scene/encode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/graph-studio/src/scene/encode.ts`**

```ts
import type { NodeType } from '@voidcorp/harness-graph';

// Neon-holographic hues (bloom-lit in Task 12). Aligned with the HUD palette tokens.
export const TYPE_COLORS: Record<NodeType, string> = {
  skill: '#5eead4', // holo-teal
  agent: '#a78bfa', // holo-violet
  hook: '#ffb547', // holo-amber
  command: '#36e0ff', // holo-cyan
  pack: '#f472b6', // holo-magenta
  'workflow-def': '#9ae600', // holo-lime
};

/** Node radius from line count: sqrt scale, floored so tiny nodes stay visible. */
export function sizeForLines(lines: number): number {
  return 2 + Math.sqrt(Math.max(0, lines)) * 0.9;
}

export function colorForType(type: NodeType): string {
  return TYPE_COLORS[type];
}

/** Halo intensity 0..1 from invocation count: log-shaped, 0 means never fired. */
export function haloForCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, Math.log10(count + 1) / 3);
}

/** Deterministic per-cluster anchor on a ring (golden-angle), used by the cluster force. */
export function clusterAnchor(index: number, total: number): { x: number; y: number; z: number } {
  const radius = 120 + total * 8;
  const golden = 2.399963229728653; // 137.5 degrees in radians
  const angle = index * golden;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle * 0.5) * radius * 0.4,
    z: Math.sin(angle) * radius,
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run apps/graph-studio/src/scene/encode.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/graph-studio/src/scene/encode.ts apps/graph-studio/src/scene/encode.test.ts
git commit -m "feat(graph-studio): pure visual encoding (size/color/halo/cluster)

Why: the model->visual mapping is the testable heart of the renderer; keep
it pure so the encoding is verifiable without a WebGL context."
```

---

### Task 4: Pure edge families

**Files:**
- Create: `apps/graph-studio/src/scene/families.ts`
- Create: `apps/graph-studio/src/scene/families.test.ts`

**Interfaces:**
- Consumes: `EdgeKind` from `@voidcorp/harness-graph`.
- Produces: `type Family = 'routing' | 'tension' | 'wiring' | 'overlay'`; `familyOf(kind: EdgeKind): Family`; `FAMILIES: readonly Family[]`; `FAMILY_LABELS: Record<Family, string>`; `FAMILY_KINDS: Record<Family, readonly EdgeKind[]>`.

- [ ] **Step 1: Write the failing test `apps/graph-studio/src/scene/families.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { FAMILIES, FAMILY_KINDS, familyOf } from './families.js';

describe('familyOf', () => {
  it('groups the seven edge kinds into the four families', () => {
    expect(familyOf('routes-to')).toBe('routing');
    expect(familyOf('composes')).toBe('routing');
    expect(familyOf('conflicts')).toBe('tension');
    expect(familyOf('overlaps')).toBe('tension');
    expect(familyOf('companion-of')).toBe('wiring');
    expect(familyOf('invokes')).toBe('wiring');
    expect(familyOf('extends')).toBe('overlay');
  });
});

describe('FAMILY_KINDS', () => {
  it('covers all four families and partitions every kind exactly once', () => {
    expect(FAMILIES).toEqual(['routing', 'tension', 'wiring', 'overlay']);
    const all = FAMILIES.flatMap((f) => FAMILY_KINDS[f]);
    expect(new Set(all).size).toBe(7);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run apps/graph-studio/src/scene/families.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/graph-studio/src/scene/families.ts`**

```ts
import type { EdgeKind } from '@voidcorp/harness-graph';

export type Family = 'routing' | 'tension' | 'wiring' | 'overlay';

export const FAMILIES: readonly Family[] = ['routing', 'tension', 'wiring', 'overlay'];

export const FAMILY_LABELS: Record<Family, string> = {
  routing: 'Routing & composition',
  tension: 'Conflict & overlap',
  wiring: 'Wiring (companion / invokes)',
  overlay: 'Pack overlay',
};

export const FAMILY_KINDS: Record<Family, readonly EdgeKind[]> = {
  routing: ['routes-to', 'composes'],
  tension: ['conflicts', 'overlaps'],
  wiring: ['companion-of', 'invokes'],
  overlay: ['extends'],
};

const KIND_TO_FAMILY: Record<EdgeKind, Family> = {
  'routes-to': 'routing',
  composes: 'routing',
  conflicts: 'tension',
  overlaps: 'tension',
  'companion-of': 'wiring',
  invokes: 'wiring',
  extends: 'overlay',
};

export function familyOf(kind: EdgeKind): Family {
  return KIND_TO_FAMILY[kind];
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run apps/graph-studio/src/scene/families.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/graph-studio/src/scene/families.ts apps/graph-studio/src/scene/families.test.ts
git commit -m "feat(graph-studio): partition edge kinds into the four filter families

Why: the Structure layer filters edges by family (spec section 7); a single
total mapping keeps the legend, filters, and styling consistent."
```

---

### Task 5: Pure analysis overlays

**Files:**
- Create: `apps/graph-studio/src/scene/overlays.ts`
- Create: `apps/graph-studio/src/scene/overlays.test.ts`

**Interfaces:**
- Consumes: `Finding`, `GraphEdge` from `@voidcorp/harness-graph`.
- Produces: `buildOverlays(findings: readonly Finding[], edges: readonly GraphEdge[]): Overlays` where
  `Overlays = { conflictNodes: ReadonlySet<string>; orphanNodes: ReadonlySet<string>; holeNodes: ReadonlySet<string>; overlapEdges: readonly { from: string; to: string }[] }`.

Mapping (tolerant — unknown finding kinds are ignored, spec §10):
- `conflictNodes`: every node touched by a `conflicts` edge, plus nodes of `routing-cycle` findings.
- `overlapEdges`: every `overlaps` edge, plus a pair-edge for each `overlap` finding (its two `nodes`).
- `orphanNodes`: nodes of `orphan` findings.
- `holeNodes`: nodes of `coverage-hole` findings (none in P1 is fine — empty set).

- [ ] **Step 1: Write the failing test `apps/graph-studio/src/scene/overlays.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildOverlays } from './overlays.js';

const finding = (kind: string, nodes: string[]) => ({ kind, severity: 'warning' as const, nodes, evidence: 'e', suggestion: 's' });
const edge = (from: string, to: string, kind: 'conflicts' | 'overlaps' | 'routes-to') =>
  ({ from, to, kind, origin: 'declared' as const, evidence: 'e' });

describe('buildOverlays', () => {
  it('collects conflict nodes from conflicts edges and routing-cycle findings', () => {
    const o = buildOverlays([finding('routing-cycle', ['skill:a', 'skill:b'])], [edge('skill:c', 'skill:d', 'conflicts')]);
    expect(o.conflictNodes).toEqual(new Set(['skill:a', 'skill:b', 'skill:c', 'skill:d']));
  });

  it('collects overlap edges from overlaps edges and overlap findings', () => {
    const o = buildOverlays([finding('overlap', ['skill:x', 'skill:y'])], [edge('skill:m', 'skill:n', 'overlaps')]);
    expect(o.overlapEdges).toContainEqual({ from: 'skill:x', to: 'skill:y' });
    expect(o.overlapEdges).toContainEqual({ from: 'skill:m', to: 'skill:n' });
  });

  it('collects orphan nodes and ignores unknown finding kinds', () => {
    const o = buildOverlays([finding('orphan', ['skill:lonely']), finding('mystery', ['skill:z'])], []);
    expect(o.orphanNodes).toEqual(new Set(['skill:lonely']));
    expect(o.holeNodes.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run apps/graph-studio/src/scene/overlays.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/graph-studio/src/scene/overlays.ts`**

```ts
import type { Finding, GraphEdge } from '@voidcorp/harness-graph';

export interface Overlays {
  readonly conflictNodes: ReadonlySet<string>;
  readonly orphanNodes: ReadonlySet<string>;
  readonly holeNodes: ReadonlySet<string>;
  readonly overlapEdges: readonly { from: string; to: string }[];
}

export function buildOverlays(findings: readonly Finding[], edges: readonly GraphEdge[]): Overlays {
  const conflictNodes = new Set<string>();
  const orphanNodes = new Set<string>();
  const holeNodes = new Set<string>();
  const overlapEdges: { from: string; to: string }[] = [];

  for (const e of edges) {
    if (e.kind === 'conflicts') {
      conflictNodes.add(e.from);
      conflictNodes.add(e.to);
    } else if (e.kind === 'overlaps') {
      overlapEdges.push({ from: e.from, to: e.to });
    }
  }

  for (const f of findings) {
    switch (f.kind) {
      case 'routing-cycle':
        for (const n of f.nodes) conflictNodes.add(n);
        break;
      case 'overlap':
        if (f.nodes.length >= 2 && f.nodes[0] && f.nodes[1]) overlapEdges.push({ from: f.nodes[0], to: f.nodes[1] });
        break;
      case 'orphan':
        for (const n of f.nodes) orphanNodes.add(n);
        break;
      case 'coverage-hole':
        for (const n of f.nodes) holeNodes.add(n);
        break;
      default:
        break;
    }
  }

  return { conflictNodes, orphanNodes, holeNodes, overlapEdges };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run apps/graph-studio/src/scene/overlays.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/graph-studio/src/scene/overlays.ts apps/graph-studio/src/scene/overlays.test.ts
git commit -m "feat(graph-studio): derive analysis overlays from findings + tension edges

Why: the Analysis layer (halos, muted orphans, overlap tension edges) needs
a pure descriptor it can render; tolerant mapping keeps unknown future
finding kinds from crashing the view."
```

---

### Task 6: Pure layer / family / search selection

**Files:**
- Create: `apps/graph-studio/src/scene/select.ts`
- Create: `apps/graph-studio/src/scene/select.test.ts`

**Interfaces:**
- Consumes: `GraphModel`, `GraphEdge` from `@voidcorp/harness-graph`; `Family`, `familyOf` from `./families.js`.
- Produces: `type LayerName = 'structure' | 'analysis' | 'flow' | 'workflows'`; `interface ViewState { layers: Record<LayerName, boolean>; families: ReadonlySet<Family>; search: string }`; `defaultViewState(): ViewState`; `selectVisible(model: GraphModel, state: ViewState): { nodeIds: ReadonlySet<string>; edges: readonly GraphEdge[] }`.

Rules:
- A node matches the search if `state.search` is empty, or its `id` or `description` contains the query (case-insensitive).
- Visible edges: those whose `family` is in `state.families` **and** both endpoints pass the search filter. When the `structure` layer is off, no structural edges show (empty).
- Visible nodes: all nodes passing the search filter (nodes are always shown so analysis/flow/workflow layers have anchors; edges are what the family filter gates).

- [ ] **Step 1: Write the failing test `apps/graph-studio/src/scene/select.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { defaultViewState, selectVisible } from './select.js';

const node = (id: string, description = '') => ({ id, type: 'skill' as const, name: id, description, lines: 1, pack: null, source: 's' });
const edge = (from: string, to: string, kind: 'routes-to' | 'extends') => ({ from, to, kind, origin: 'declared' as const, evidence: 'e' });
const model = {
  version: 1 as const,
  nodes: [node('skill:a', 'alpha'), node('skill:b', 'beta'), node('skill:c', 'gamma')],
  edges: [edge('skill:a', 'skill:b', 'routes-to'), edge('skill:a', 'skill:c', 'extends')],
};

describe('selectVisible', () => {
  it('shows routing edges but hides overlay edges when only routing is selected', () => {
    const state = { ...defaultViewState(), families: new Set(['routing' as const]) };
    const { edges } = selectVisible(model, state);
    expect(edges.map((e) => e.kind)).toEqual(['routes-to']);
  });

  it('drops all structural edges when the structure layer is off', () => {
    const state = { ...defaultViewState(), layers: { ...defaultViewState().layers, structure: false } };
    expect(selectVisible(model, state).edges).toEqual([]);
  });

  it('filters nodes and their edges by a case-insensitive search', () => {
    const { nodeIds, edges } = selectVisible(model, { ...defaultViewState(), search: 'ALPHA' });
    expect([...nodeIds]).toEqual(['skill:a']);
    expect(edges).toEqual([]); // endpoints b/c filtered out
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run apps/graph-studio/src/scene/select.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/graph-studio/src/scene/select.ts`**

```ts
import type { GraphEdge, GraphModel } from '@voidcorp/harness-graph';
import { type Family, FAMILIES, familyOf } from './families.js';

export type LayerName = 'structure' | 'analysis' | 'flow' | 'workflows';

export interface ViewState {
  readonly layers: Record<LayerName, boolean>;
  readonly families: ReadonlySet<Family>;
  readonly search: string;
}

export function defaultViewState(): ViewState {
  return {
    layers: { structure: true, analysis: false, flow: false, workflows: false },
    families: new Set(FAMILIES),
    search: '',
  };
}

function matchesSearch(id: string, description: string, query: string): boolean {
  if (query === '') return true;
  const q = query.toLowerCase();
  return id.toLowerCase().includes(q) || description.toLowerCase().includes(q);
}

export function selectVisible(model: GraphModel, state: ViewState): { nodeIds: ReadonlySet<string>; edges: readonly GraphEdge[] } {
  const nodeIds = new Set<string>();
  for (const n of model.nodes) {
    if (matchesSearch(n.id, n.description, state.search)) nodeIds.add(n.id);
  }
  if (!state.layers.structure) return { nodeIds, edges: [] };
  const edges = model.edges.filter(
    (e) => state.families.has(familyOf(e.kind)) && nodeIds.has(e.from) && nodeIds.has(e.to),
  );
  return { nodeIds, edges };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run apps/graph-studio/src/scene/select.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/graph-studio/src/scene/select.ts apps/graph-studio/src/scene/select.test.ts
git commit -m "feat(graph-studio): pure layer/family/search selection

Why: what is visible is a pure function of the view state; isolating it
makes the filter behavior testable and the render loop a thin projection."
```

---

### Task 7: Render core — 3D graph, camera, data loading, wiring

**Files:**
- Create: `apps/graph-studio/src/data/load.ts`
- Create: `apps/graph-studio/src/render/graph.ts`
- Create: `apps/graph-studio/src/render/camera.ts`
- Rewrite: `apps/graph-studio/src/main.ts`

**Interfaces:**
- Consumes: generated JSON; `sizeForLines`, `colorForType`, `clusterAnchor` (Task 3); `selectVisible`, `defaultViewState` (Task 6).
- Produces: `loadData(): StudioData` (typed view over the four generated blobs); `createGraph(el, data): GraphHandle` where `GraphHandle` exposes `setView(state)`, `onNodeClick(cb)`, `graph` (the 3d-force-graph instance); `focusNode(graph, node)`.

This task is **imperative shell** — verified by `vite build` + manual `vite dev`, not unit tests (spec §11). **Source-driven:** before writing, open `node_modules/3d-force-graph/README.md` and `node_modules/gsap/README.md` and reconcile the API below with the installed versions.

- [ ] **Step 1: Write `apps/graph-studio/src/data/load.ts`**

```ts
import type { GraphModel } from '@voidcorp/harness-graph';
import type { Finding } from '@voidcorp/harness-graph';
import model from '../generated/model.json' with { type: 'json' };
import findings from '../generated/findings.json' with { type: 'json' };
import usage from '../generated/usage-summary.json' with { type: 'json' };
import workflows from '../generated/workflows.json' with { type: 'json' };
import type { UsageSummary, WorkflowMeta } from './types.js';

export interface StudioData {
  readonly model: GraphModel;
  readonly findings: readonly Finding[];
  readonly usage: UsageSummary;
  readonly workflows: Record<string, WorkflowMeta>;
}

export function loadData(): StudioData {
  return {
    model: model as GraphModel,
    findings: findings as readonly Finding[],
    usage: usage as UsageSummary,
    workflows: workflows as Record<string, WorkflowMeta>,
  };
}
```

- [ ] **Step 2: Write `apps/graph-studio/src/render/camera.ts`**

```ts
import { gsap } from 'gsap';
import type { GraphNode } from '@voidcorp/harness-graph';

// A 3d-force-graph node carries its simulated position once the engine ticks.
interface Positioned { x?: number; y?: number; z?: number }

interface CameraGraph {
  cameraPosition(pos: { x: number; y: number; z: number }, lookAt: { x: number; y: number; z: number }, ms: number): void;
}

/** Tween the camera to frame a node (GSAP drives the distance; the graph lib does the move). */
export function focusNode(graph: CameraGraph, node: GraphNode & Positioned): void {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const z = node.z ?? 0;
  const distance = 120;
  const state = { d: 320 };
  gsap.to(state, {
    d: distance,
    duration: 0.8,
    ease: 'power2.out',
    onUpdate: () => {
      const ratio = 1 + state.d / Math.hypot(x, y, z || 1);
      graph.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, 0);
    },
  });
}
```

- [ ] **Step 3: Write `apps/graph-studio/src/render/graph.ts`**

```ts
import ForceGraph3D from '3d-force-graph';
import type { GraphModel, GraphNode } from '@voidcorp/harness-graph';
import { clusterAnchor, colorForType, sizeForLines } from '../scene/encode.js';
import { familyOf } from '../scene/families.js';
import { type ViewState, selectVisible } from '../scene/select.js';

const FAMILY_EDGE_COLORS = {
  routing: '#5eead4',
  tension: '#f87171',
  wiring: '#94a3b8',
  overlay: '#f472b6',
} as const;

type GraphInstance = ReturnType<typeof ForceGraph3D>;

export interface GraphHandle {
  readonly graph: GraphInstance;
  setView(state: ViewState): void;
  onNodeClick(cb: (node: GraphNode) => void): void;
}

export function createGraph(el: HTMLElement, model: GraphModel): GraphHandle {
  // Deterministic per-pack anchor so clusters land in stable regions.
  const packs = [...new Set(model.nodes.map((n) => n.pack ?? 'core'))].sort();
  const anchorOf = (n: GraphNode) => clusterAnchor(packs.indexOf(n.pack ?? 'core'), packs.length);

  const graph = ForceGraph3D()(el)
    .backgroundColor('#0a0a0f')
    .nodeId('id')
    .nodeLabel((n) => `${(n as GraphNode).id} (${(n as GraphNode).lines} lines)`)
    .nodeVal((n) => sizeForLines((n as GraphNode).lines))
    .nodeColor((n) => colorForType((n as GraphNode).type))
    .linkColor((l) => FAMILY_EDGE_COLORS[familyOf((l as { kind: GraphModel['edges'][number]['kind'] }).kind)])
    .linkOpacity(0.4)
    .linkWidth(0.5);

  // Pull each node toward its pack anchor for spatial clustering by pack (spec section 7).
  graph
    .d3Force('x', { initialize: () => {}, strength: 0.06, x: (n: GraphNode) => anchorOf(n).x } as never)
    .d3Force('y', { initialize: () => {}, strength: 0.06, y: (n: GraphNode) => anchorOf(n).y } as never);

  const setView = (state: ViewState): void => {
    const { nodeIds, edges } = selectVisible(model, state);
    graph.graphData({
      nodes: model.nodes.filter((n) => nodeIds.has(n.id)).map((n) => ({ ...n })),
      links: edges.map((e) => ({ ...e, source: e.from, target: e.to })),
    });
  };

  const onNodeClick = (cb: (node: GraphNode) => void): void => {
    graph.onNodeClick((n) => cb(n as GraphNode));
  };

  return { graph, setView, onNodeClick };
}
```

Note: `.d3Force('x', forceX(...))` is the documented 3d-force-graph hook into d3-force. The object literal above is a sketch — replace it with the real `forceX`/`forceY` from `d3-force` (already transitively installed): `import { forceX, forceY } from 'd3-force';` then `.d3Force('x', forceX<GraphNode>().strength(0.06).x((n) => anchorOf(n).x))`. Add `d3-force` + `@types/d3-force` to devDependencies if you import it directly. Reconcile against the installed `3d-force-graph` README.

- [ ] **Step 4: Rewrite `apps/graph-studio/src/main.ts`**

```ts
import { loadData } from './data/load.js';
import { createGraph } from './render/graph.js';
import { defaultViewState } from './scene/select.js';

const el = document.getElementById('scene');
if (!el) throw new Error('graph-studio: #scene container missing');

const data = loadData();
const handle = createGraph(el, data.model);
handle.setView(defaultViewState());
handle.onNodeClick((node) => {
  // Side panel arrives in Task 8; reflect the click in the title so the path is
  // observable without a console statement (repo norm: no console in committed code).
  document.title = `graph studio // ${node.id}`;
});
```

- [ ] **Step 5: Build + typecheck, then run the dev server and confirm the graph renders**

```bash
pnpm --filter @voidcorp/graph-studio prepare-data
pnpm --filter @voidcorp/graph-studio typecheck
pnpm --filter @voidcorp/graph-studio build
pnpm --filter @voidcorp/graph-studio dev
```

Expected: typecheck clean; `vite build` emits `dist/` with no errors; opening the dev URL shows a 3D force graph of ~102 nodes, colored by type, sized by lines, clustered loosely by pack, rotatable/zoomable, and clicking a node logs its id. (Manual visual check — this is the smoke verification, not an automated test.)

- [ ] **Step 6: Commit**

```bash
git add apps/graph-studio/src/data/load.ts apps/graph-studio/src/render apps/graph-studio/src/main.ts apps/graph-studio/package.json
git commit -m "feat(graph-studio): render the structural 3D graph (force-graph + camera)

Why: the Structure layer is the spine of the maintainer view; nodes encode
type/size, edges encode family, and a pack-anchored force gives the spatial
clustering the spec calls for."
```

---

### Task 8: Side panel, controls, and pure UI state

**Files:**
- Create: `apps/graph-studio/src/ui/state.ts`
- Create: `apps/graph-studio/src/ui/state.test.ts`
- Create: `apps/graph-studio/src/ui/panel.ts`
- Create: `apps/graph-studio/src/ui/controls.ts`
- Create: `apps/graph-studio/src/ui/styles.css`
- Modify: `apps/graph-studio/src/main.ts`
- Modify: `apps/graph-studio/index.html` (link the stylesheet)

**Interfaces:**
- Consumes: `ViewState`, `LayerName`, `defaultViewState` (Task 6); `Family`, `FAMILIES`, `FAMILY_LABELS` (Task 4); `Overlays` (Task 5); `StudioData` (Task 7).
- Produces (pure): `toggleLayer(state, layer): ViewState`; `toggleFamily(state, family): ViewState`; `setSearch(state, query): ViewState`.
- Produces (imperative): `renderPanel(host, data, node): void`; `renderControls(host, opts): void` where `opts = { state, onChange: (next: ViewState) => void }`.

- [ ] **Step 1: Write the failing test `apps/graph-studio/src/ui/state.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { defaultViewState } from '../scene/select.js';
import { setSearch, toggleFamily, toggleLayer } from './state.js';

describe('ui state reducers', () => {
  it('toggles a layer without mutating the input', () => {
    const a = defaultViewState();
    const b = toggleLayer(a, 'analysis');
    expect(b.layers.analysis).toBe(true);
    expect(a.layers.analysis).toBe(false); // immutable
  });

  it('toggles a family in and out of the active set', () => {
    const a = defaultViewState();
    const without = toggleFamily(a, 'overlay');
    expect(without.families.has('overlay')).toBe(false);
    expect(toggleFamily(without, 'overlay').families.has('overlay')).toBe(true);
  });

  it('sets the search query', () => {
    expect(setSearch(defaultViewState(), 'tdd').search).toBe('tdd');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run apps/graph-studio/src/ui/state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/graph-studio/src/ui/state.ts`**

```ts
import type { Family } from '../scene/families.js';
import type { LayerName, ViewState } from '../scene/select.js';

export function toggleLayer(state: ViewState, layer: LayerName): ViewState {
  return { ...state, layers: { ...state.layers, [layer]: !state.layers[layer] } };
}

export function toggleFamily(state: ViewState, family: Family): ViewState {
  const families = new Set(state.families);
  if (families.has(family)) families.delete(family);
  else families.add(family);
  return { ...state, families };
}

export function setSearch(state: ViewState, query: string): ViewState {
  return { ...state, search: query };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run apps/graph-studio/src/ui/state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `apps/graph-studio/src/ui/styles.css`**

```css
/* Holographic HUD chrome (JARVIS/Alita): glassmorphic panels with animated
   corner brackets, a moving scanline, cyan edge-glow, and a display face. */
.panel, .controls {
  position: fixed;
  z-index: 10;
  background: linear-gradient(180deg, rgba(10, 15, 28, 0.78), rgba(4, 6, 13, 0.72));
  border: 1px solid rgba(54, 224, 255, 0.35);
  border-radius: 4px;
  padding: 14px 16px;
  backdrop-filter: blur(10px) saturate(120%);
  box-shadow: 0 0 0 1px rgba(54, 224, 255, 0.08), 0 0 28px rgba(54, 224, 255, 0.12), inset 0 0 24px rgba(54, 224, 255, 0.04);
  color: var(--ink);
  overflow: hidden;
}
/* Animated targeting corner brackets (top-left + bottom-right via two pseudo-frames). */
.panel::before, .controls::before {
  content: ''; position: absolute; inset: 6px; pointer-events: none; border-radius: 2px;
  background:
    linear-gradient(var(--holo-cyan), var(--holo-cyan)) left top / 14px 1px no-repeat,
    linear-gradient(var(--holo-cyan), var(--holo-cyan)) left top / 1px 14px no-repeat,
    linear-gradient(var(--holo-cyan), var(--holo-cyan)) right bottom / 14px 1px no-repeat,
    linear-gradient(var(--holo-cyan), var(--holo-cyan)) right bottom / 1px 14px no-repeat;
  opacity: 0.7; animation: bracket-breathe 3.2s ease-in-out infinite;
}
/* Moving scanline overlay. */
.panel::after, .controls::after {
  content: ''; position: absolute; left: 0; right: 0; height: 2px; pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(54, 224, 255, 0.5), transparent);
  animation: scanline 4.5s linear infinite; opacity: 0.5;
}
@keyframes bracket-breathe { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.85; } }
@keyframes scanline { 0% { top: 0; } 100% { top: 100%; } }
@media (prefers-reduced-motion: reduce) {
  .panel::before, .controls::before, .panel::after, .controls::after { animation: none; }
}

.controls { top: 16px; left: 16px; display: flex; flex-direction: column; gap: 9px; max-width: 270px; }
.panel { top: 16px; right: 16px; width: 330px; max-height: 88vh; overflow: auto; display: none; }
.panel.open { display: block; }
.panel h2, .controls input[type='search'] { font-family: 'Rajdhani', ui-monospace, monospace; }
.panel h2 { margin: 0 0 8px; font-family: 'Orbitron', monospace; font-size: 14px; letter-spacing: 0.06em; color: var(--holo-cyan); text-shadow: 0 0 10px rgba(54, 224, 255, 0.5); text-transform: uppercase; }
.panel .meta { color: var(--ink-dim); margin-bottom: 8px; letter-spacing: 0.03em; }
.panel .flag { color: var(--alert); text-shadow: 0 0 8px rgba(255, 77, 109, 0.5); }
.panel strong { color: var(--holo-amber); font-family: 'Orbitron', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.panel ul, .panel ol { margin: 4px 0 12px; padding-left: 16px; color: var(--ink); }
.panel li { margin: 2px 0; }
.controls label { display: flex; align-items: center; gap: 7px; cursor: pointer; }
.controls input[type='search'] { width: 100%; padding: 5px 8px; background: rgba(4, 6, 13, 0.6); border: 1px solid rgba(54, 224, 255, 0.3); color: var(--ink); border-radius: 3px; }
.controls input[type='search']:focus { outline: none; border-color: var(--holo-cyan); box-shadow: 0 0 12px rgba(54, 224, 255, 0.3); }
.controls .group { border-top: 1px solid rgba(54, 224, 255, 0.18); padding-top: 8px; }
.controls button { cursor: pointer; background: rgba(54, 224, 255, 0.08); color: var(--holo-cyan); border: 1px solid rgba(54, 224, 255, 0.4); border-radius: 3px; padding: 5px 10px; font-family: 'Orbitron', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; transition: all 0.18s ease; }
.controls button:hover { background: rgba(54, 224, 255, 0.18); box-shadow: 0 0 14px rgba(54, 224, 255, 0.35); }
a { color: var(--holo-teal); text-decoration: none; border-bottom: 1px dotted rgba(94, 234, 212, 0.5); word-break: break-all; }
a:hover { color: var(--holo-cyan); }
```

- [ ] **Step 6: Write `apps/graph-studio/src/ui/panel.ts`**

```ts
import type { GraphModel, GraphNode } from '@voidcorp/harness-graph';
import type { Overlays } from '../scene/overlays.js';

const GITHUB_BASE = 'https://github.com/voidcorp-core/void-harness/blob/main/';

function edgesFor(model: GraphModel, id: string): string[] {
  return model.edges
    .filter((e) => e.from === id || e.to === id)
    .map((e) => `${e.from} -[${e.kind}]-> ${e.to}`);
}

/** Render the side panel for a clicked node (description, lines, edges, analysis flags, source link). */
export function renderPanel(host: HTMLElement, model: GraphModel, overlays: Overlays, node: GraphNode): void {
  const flags: string[] = [];
  if (overlays.conflictNodes.has(node.id)) flags.push('in a conflict / routing cycle');
  if (overlays.orphanNodes.has(node.id)) flags.push('orphan (no relations, never fired)');
  if (overlays.holeNodes.has(node.id)) flags.push('coverage hole');

  const edgeList = edgesFor(model, node.id);
  host.innerHTML = '';
  host.classList.add('open');
  const h = document.createElement('h2');
  h.textContent = node.id;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${node.type} | ${node.lines} lines | pack: ${node.pack ?? 'core'}`;
  const desc = document.createElement('p');
  desc.textContent = node.description || '(no description)';
  host.append(h, meta, desc);

  if (flags.length > 0) {
    const f = document.createElement('p');
    f.className = 'flag';
    f.textContent = `Flags: ${flags.join('; ')}`;
    host.append(f);
  }

  const edgesTitle = document.createElement('strong');
  edgesTitle.textContent = `Edges (${edgeList.length})`;
  const ul = document.createElement('ul');
  for (const line of edgeList) {
    const li = document.createElement('li');
    li.textContent = line;
    ul.append(li);
  }
  host.append(edgesTitle, ul);

  const link = document.createElement('a');
  link.href = `${GITHUB_BASE}${node.source}`;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = node.source;
  host.append(link);
}
```

- [ ] **Step 7: Write `apps/graph-studio/src/ui/controls.ts`**

```ts
import { FAMILIES, FAMILY_LABELS } from '../scene/families.js';
import type { LayerName, ViewState } from '../scene/select.js';
import { setSearch, toggleFamily, toggleLayer } from './state.js';

const LAYERS: readonly { key: LayerName; label: string }[] = [
  { key: 'structure', label: 'Structure' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'flow', label: 'Flow' },
  { key: 'workflows', label: 'Workflows' },
];

export interface ControlsOptions {
  state: ViewState;
  onChange(next: ViewState): void;
  onPlayFlow(): void;
}

/** Render layer toggles, family filters, a search box, and the play-flow button. */
export function renderControls(host: HTMLElement, opts: ControlsOptions): void {
  let state = opts.state;
  const rerender = (next: ViewState): void => {
    state = next;
    opts.onChange(next);
    draw();
  };

  function draw(): void {
    host.innerHTML = '';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'search id / description';
    search.value = state.search;
    search.addEventListener('input', () => rerender(setSearch(state, search.value)));
    host.append(search);

    const layers = document.createElement('div');
    layers.className = 'group';
    for (const l of LAYERS) {
      layers.append(checkbox(l.label, state.layers[l.key], () => rerender(toggleLayer(state, l.key))));
    }
    host.append(layers);

    const fams = document.createElement('div');
    fams.className = 'group';
    for (const f of FAMILIES) {
      fams.append(checkbox(FAMILY_LABELS[f], state.families.has(f), () => rerender(toggleFamily(state, f))));
    }
    host.append(fams);

    const play = document.createElement('button');
    play.textContent = 'Play flow';
    play.addEventListener('click', () => opts.onPlayFlow());
    host.append(play);
  }

  draw();
}

function checkbox(label: string, checked: boolean, onToggle: () => void): HTMLLabelElement {
  const wrap = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', onToggle);
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(input, span);
  return wrap;
}
```

- [ ] **Step 8: Link the stylesheet in `index.html`**

Add inside `<head>` (after the inline `<style>` block):

```html
    <link rel="stylesheet" href="/src/ui/styles.css" />
```

- [ ] **Step 9: Rewrite `apps/graph-studio/src/main.ts` to wire panel + controls**

```ts
import { loadData } from './data/load.js';
import { createGraph } from './render/graph.js';
import { buildOverlays } from './scene/overlays.js';
import { defaultViewState } from './scene/select.js';
import { renderControls } from './ui/controls.js';
import { renderPanel } from './ui/panel.js';

const scene = document.getElementById('scene');
if (!scene) throw new Error('graph-studio: #scene container missing');

const data = loadData();
const overlays = buildOverlays(data.findings, data.model.edges);

const panel = document.createElement('div');
panel.className = 'panel';
const controls = document.createElement('div');
controls.className = 'controls';
document.body.append(panel, controls);

let state = defaultViewState();
const handle = createGraph(scene, data.model);
handle.setView(state);
handle.onNodeClick((node) => renderPanel(panel, data.model, overlays, node));

renderControls(controls, {
  state,
  onChange: (next) => {
    state = next;
    handle.setView(next);
  },
  onPlayFlow: () => {
    // Implemented in Task 10.
  },
});
```

- [ ] **Step 10: Typecheck, build, run, verify interaction**

```bash
pnpm --filter @voidcorp/graph-studio typecheck
pnpm --filter @voidcorp/graph-studio build
pnpm vitest run apps/graph-studio
pnpm lint
pnpm --filter @voidcorp/graph-studio dev
```

Expected: typecheck/build/lint clean; state tests pass; in the browser, the controls panel toggles layers/families and filters the graph live; toggling a family hides those edges; typing in search narrows nodes; clicking a node opens the side panel with description, lines, edges, any analysis flags, and a working source link.

- [ ] **Step 11: Commit**

```bash
git add apps/graph-studio/src/ui apps/graph-studio/src/main.ts apps/graph-studio/index.html
git commit -m "feat(graph-studio): side panel, layer/family/search controls

Why: the maintainer needs to interrogate a node (edges, evidence, flags,
source) and drive the layers/filters; the pure state reducers keep the
control logic testable and the DOM a thin projection."
```

---

### Task 9: Analysis layer render (halos, muted orphans, hole markers, overlap edges)

**Files:**
- Create: `apps/graph-studio/src/render/overlays.ts`
- Modify: `apps/graph-studio/src/render/graph.ts` (apply overlays in `setView`)
- Modify: `apps/graph-studio/src/main.ts` (pass overlays into the graph)

**Interfaces:**
- Consumes: `Overlays` (Task 5); the 3d-force-graph instance.
- Produces: `applyAnalysisStyling(graph, overlays, active): void` — when `active`, mute non-flagged nodes, brighten conflict nodes (GSAP-pulsed ring via node opacity), add overlap tension links; when inactive, restore.

This is **imperative shell** (smoke-verified). Source-driven: confirm `nodeOpacity`, `nodeThreeObject`, and dynamic link APIs against the installed `3d-force-graph`.

- [ ] **Step 1: Write `apps/graph-studio/src/render/overlays.ts`**

```ts
import { gsap } from 'gsap';
import type { GraphNode } from '@voidcorp/harness-graph';
import type { Overlays } from '../scene/overlays.js';

interface StylableGraph {
  nodeColor(fn: (n: object) => string): unknown;
  nodeOpacity(value: number): unknown;
}

/**
 * Apply (or clear) the Analysis layer styling: muted orphans, highlighted
 * conflict nodes, dimmed background. Overlap tension edges are added to the
 * link set by the caller (they live in the graph data, not styling).
 */
export function applyAnalysisStyling(graph: StylableGraph, overlays: Overlays, active: boolean): void {
  const pulse = { t: 0 };
  if (active) {
    graph.nodeOpacity(0.85);
    graph.nodeColor((raw) => {
      const n = raw as GraphNode;
      if (overlays.conflictNodes.has(n.id)) return '#f87171';
      if (overlays.orphanNodes.has(n.id)) return '#3a3a48';
      if (overlays.holeNodes.has(n.id)) return '#fbbf24';
      return '#5a5a6e';
    });
    gsap.to(pulse, { t: 1, duration: 1.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  } else {
    gsap.killTweensOf(pulse);
    graph.nodeOpacity(0.95);
  }
}
```

- [ ] **Step 2: Wire overlay edges + styling into `render/graph.ts`**

In `createGraph`, accept overlays and extend `setView` to append overlap tension edges and call the styling when the analysis layer is active. Change the signature to `createGraph(el, model, overlays)` and update `setView`:

```ts
// add import:
import { applyAnalysisStyling } from './overlays.js';
import type { Overlays } from '../scene/overlays.js';

// change the factory signature to:
export function createGraph(el: HTMLElement, model: GraphModel, overlays: Overlays): GraphHandle {
  // ... existing setup unchanged ...

  const setView = (state: ViewState): void => {
    const { nodeIds, edges } = selectVisible(model, state);
    const links = edges.map((e) => ({ ...e, source: e.from, target: e.to }));
    if (state.layers.analysis) {
      for (const o of overlays.overlapEdges) {
        if (nodeIds.has(o.from) && nodeIds.has(o.to)) {
          links.push({ from: o.from, to: o.to, kind: 'overlaps', origin: 'derived', evidence: 'overlap', source: o.from, target: o.to });
        }
      }
    }
    graph.graphData({ nodes: model.nodes.filter((n) => nodeIds.has(n.id)).map((n) => ({ ...n })), links });
    applyAnalysisStyling(graph as never, overlays, state.layers.analysis);
  };

  // ... rest unchanged ...
}
```

- [ ] **Step 3: Pass overlays into `createGraph` in `main.ts`**

Change the call to `const handle = createGraph(scene, data.model, overlays);`

- [ ] **Step 4: Typecheck, build, run, verify**

```bash
pnpm --filter @voidcorp/graph-studio typecheck
pnpm --filter @voidcorp/graph-studio build
pnpm lint
pnpm --filter @voidcorp/graph-studio dev
```

Expected: clean typecheck/build/lint; toggling the **Analysis** layer dims the background nodes, highlights conflict nodes (pulsing red), mutes orphans, marks coverage holes (if any), and draws overlap tension edges; toggling it off restores the structural styling.

- [ ] **Step 5: Commit**

```bash
git add apps/graph-studio/src/render/overlays.ts apps/graph-studio/src/render/graph.ts apps/graph-studio/src/main.ts
git commit -m "feat(graph-studio): analysis layer (halos, muted orphans, overlap edges)

Why: surfacing conflicts/orphans/holes/overlaps in the 3D view is the whole
point of the maintainer surface; the overlays are a pure descriptor styled
on top of the structural graph."
```

---

### Task 10: Structural flow (GSAP particle impulse)

**Files:**
- Create: `apps/graph-studio/src/scene/flow.ts`
- Create: `apps/graph-studio/src/scene/flow.test.ts`
- Create: `apps/graph-studio/src/render/flow.ts`
- Modify: `apps/graph-studio/src/main.ts` (wire `onPlayFlow`)

**Interfaces:**
- Consumes: `GraphModel` from `@voidcorp/harness-graph`; the 3d-force-graph instance.
- Produces (pure): `flowChain(model, startId): string[][]` — BFS levels over the routing family (`routes-to` + `composes`) from `startId`, each inner array a wavefront. Produces (imperative): `playFlow(graph, model, startId): void` — emit particle bursts level-by-level with GSAP timing.

- [ ] **Step 1: Write the failing test `apps/graph-studio/src/scene/flow.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { flowChain } from './flow.js';

const node = (id: string) => ({ id, type: 'skill' as const, name: id, description: '', lines: 1, pack: null, source: 's' });
const e = (from: string, to: string, kind: 'routes-to' | 'composes' | 'extends') => ({ from, to, kind, origin: 'declared' as const, evidence: 'x' });
const model = {
  version: 1 as const,
  nodes: ['a', 'b', 'c', 'd'].map((x) => node(`skill:${x}`)),
  edges: [e('skill:a', 'skill:b', 'routes-to'), e('skill:b', 'skill:c', 'composes'), e('skill:a', 'skill:d', 'extends')],
};

describe('flowChain', () => {
  it('returns BFS wavefronts over the routing family only', () => {
    expect(flowChain(model, 'skill:a')).toEqual([['skill:a'], ['skill:b'], ['skill:c']]);
  });

  it('returns a single-level chain for a sink node', () => {
    expect(flowChain(model, 'skill:c')).toEqual([['skill:c']]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run apps/graph-studio/src/scene/flow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/graph-studio/src/scene/flow.ts`**

```ts
import type { GraphModel } from '@voidcorp/harness-graph';
import { familyOf } from './families.js';

/** BFS wavefronts down the routing family (routes-to + composes) from a start node. Pure. */
export function flowChain(model: GraphModel, startId: string): string[][] {
  const adj = new Map<string, string[]>();
  for (const e of model.edges) {
    if (familyOf(e.kind) !== 'routing') continue;
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }
  const levels: string[][] = [];
  const seen = new Set<string>([startId]);
  let frontier = [startId];
  while (frontier.length > 0) {
    levels.push([...frontier]);
    const next: string[] = [];
    for (const id of frontier) {
      for (const to of adj.get(id) ?? []) {
        if (!seen.has(to)) {
          seen.add(to);
          next.push(to);
        }
      }
    }
    frontier = next;
  }
  return levels;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run apps/graph-studio/src/scene/flow.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `apps/graph-studio/src/render/flow.ts`**

Source-driven: 3d-force-graph exposes `.emitParticle(link)` for one-shot particles and `.linkDirectionalParticles`. Confirm both against the installed README before finalizing.

```ts
import { gsap } from 'gsap';
import type { GraphModel } from '@voidcorp/harness-graph';
import { familyOf } from '../scene/families.js';
import { flowChain } from '../scene/flow.js';

interface ParticleGraph {
  emitParticle(link: object): void;
  graphData(): { links: { source: string | { id: string }; target: string | { id: string }; kind: string }[] };
}

function endpointId(end: string | { id: string }): string {
  return typeof end === 'string' ? end : end.id;
}

/** Animate a routing impulse: emit particle bursts wavefront by wavefront from startId. */
export function playFlow(graph: ParticleGraph, model: GraphModel, startId: string): void {
  const levels = flowChain(model, startId);
  const links = graph.graphData().links.filter((l) => familyOf(l.kind as never) === 'routing');
  const timeline = gsap.timeline();
  for (let i = 0; i < levels.length - 1; i += 1) {
    const fromSet = new Set(levels[i]);
    const toSet = new Set(levels[i + 1]);
    const wave = links.filter((l) => fromSet.has(endpointId(l.source)) && toSet.has(endpointId(l.target)));
    timeline.call(() => { for (const l of wave) graph.emitParticle(l); }, [], i * 0.45);
  }
}
```

- [ ] **Step 6: Wire `onPlayFlow` in `main.ts`**

Replace the empty `onPlayFlow` with a flow from a sensible start node (the brainstorming skill if present, else the first node):

```ts
// add import:
import { playFlow } from './render/flow.js';

// in renderControls options:
  onPlayFlow: () => {
    const start = data.model.nodes.find((n) => n.id === 'skill:brainstorming') ?? data.model.nodes[0];
    if (start) playFlow(handle.graph as never, data.model, start.id);
  },
```

- [ ] **Step 7: Typecheck, build, test, run, verify**

```bash
pnpm --filter @voidcorp/graph-studio typecheck
pnpm --filter @voidcorp/graph-studio build
pnpm vitest run apps/graph-studio
pnpm --filter @voidcorp/graph-studio dev
```

Expected: clean typecheck/build; flow tests pass; clicking **Play flow** sends particle bursts propagating outward from brainstorming along `routes-to`/`composes`, wavefront by wavefront.

- [ ] **Step 8: Commit**

```bash
git add apps/graph-studio/src/scene/flow.ts apps/graph-studio/src/scene/flow.test.ts apps/graph-studio/src/render/flow.ts apps/graph-studio/src/main.ts
git commit -m "feat(graph-studio): structural flow impulse (GSAP particle bursts)

Why: the structural-flow layer makes the routing/composition chains legible
by animating an impulse through them; the wavefront math is pure and tested,
the particle emission is the imperative shell."
```

---

### Task 11: Workflow-def viewer (phase schematic; run replay deferred to P2)

**Files:**
- Create: `apps/graph-studio/src/scene/workflow-view.ts`
- Create: `apps/graph-studio/src/scene/workflow-view.test.ts`
- Create: `apps/graph-studio/src/ui/workflow.ts`
- Modify: `apps/graph-studio/src/main.ts` (open the workflow view on workflow-def click)

**Interfaces:**
- Consumes: `GraphModel`, `GraphNode` from `@voidcorp/harness-graph`; `WorkflowMeta` from `../data/types.js`.
- Produces (pure): `workflowView(model, node, meta): WorkflowView` where
  `WorkflowView = { id: string; phases: readonly { title: string; detail: string }[]; neighbors: readonly { id: string; kind: string }[] }`.
  Produces (imperative): `renderWorkflowView(host, view): void`.

- [ ] **Step 1: Write the failing test `apps/graph-studio/src/scene/workflow-view.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { workflowView } from './workflow-view.js';

const wf = { id: 'workflow-def:demo', type: 'workflow-def' as const, name: 'demo', description: '', lines: 9, pack: null, source: 's' };
const model = {
  version: 1 as const,
  nodes: [wf],
  edges: [
    { from: 'workflow-def:demo', to: 'skill:tdd', kind: 'invokes' as const, origin: 'derived' as const, evidence: 'e' },
    { from: 'agent:x', to: 'workflow-def:demo', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' },
  ],
};

describe('workflowView', () => {
  it('lists phases (filling missing detail) and incident neighbors', () => {
    const v = workflowView(model, wf, { phases: [{ title: 'Scan', detail: 'grep' }, { title: 'Fix' }] });
    expect(v.phases).toEqual([{ title: 'Scan', detail: 'grep' }, { title: 'Fix', detail: '' }]);
    expect(v.neighbors).toEqual([
      { id: 'skill:tdd', kind: 'invokes' },
      { id: 'agent:x', kind: 'routes-to' },
    ]);
  });

  it('handles a workflow with no extracted phases', () => {
    expect(workflowView(model, wf, { phases: [] }).phases).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run apps/graph-studio/src/scene/workflow-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/graph-studio/src/scene/workflow-view.ts`**

```ts
import type { GraphModel, GraphNode } from '@voidcorp/harness-graph';
import type { WorkflowMeta } from '../data/types.js';

export interface WorkflowView {
  readonly id: string;
  readonly phases: readonly { title: string; detail: string }[];
  readonly neighbors: readonly { id: string; kind: string }[];
}

/** Build the workflow-def sub-view: its phase schematic + its incident neighbors. Pure. */
export function workflowView(model: GraphModel, node: GraphNode, meta: WorkflowMeta): WorkflowView {
  const phases = meta.phases.map((p) => ({ title: p.title, detail: p.detail ?? '' }));
  const neighbors: { id: string; kind: string }[] = [];
  for (const e of model.edges) {
    if (e.from === node.id) neighbors.push({ id: e.to, kind: e.kind });
    else if (e.to === node.id) neighbors.push({ id: e.from, kind: e.kind });
  }
  return { id: node.id, phases, neighbors };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm vitest run apps/graph-studio/src/scene/workflow-view.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `apps/graph-studio/src/ui/workflow.ts`**

```ts
import type { WorkflowView } from '../scene/workflow-view.js';

/** Render the workflow sub-view: a sequential phase schematic + neighbor list. Run replay is P2. */
export function renderWorkflowView(host: HTMLElement, view: WorkflowView): void {
  host.innerHTML = '';
  host.classList.add('open');
  const h = document.createElement('h2');
  h.textContent = `workflow: ${view.id}`;
  host.append(h);

  if (view.phases.length > 0) {
    const phasesTitle = document.createElement('strong');
    phasesTitle.textContent = 'Phases';
    const ol = document.createElement('ol');
    for (const p of view.phases) {
      const li = document.createElement('li');
      li.textContent = p.detail ? `${p.title} - ${p.detail}` : p.title;
      ol.append(li);
    }
    host.append(phasesTitle, ol);
  } else {
    const none = document.createElement('p');
    none.className = 'meta';
    none.textContent = 'No phases declared in meta.';
    host.append(none);
  }

  const replay = document.createElement('p');
  replay.className = 'meta';
  replay.textContent = 'Run replay: available in Phase 2 (needs activation events).';
  host.append(replay);

  const neighborsTitle = document.createElement('strong');
  neighborsTitle.textContent = `Neighbors (${view.neighbors.length})`;
  const ul = document.createElement('ul');
  for (const n of view.neighbors) {
    const li = document.createElement('li');
    li.textContent = `${n.kind}: ${n.id}`;
    ul.append(li);
  }
  host.append(neighborsTitle, ul);
}
```

- [ ] **Step 6: Open the workflow view on workflow-def click in `main.ts`**

Replace the `onNodeClick` handler so workflow-def nodes open the workflow view and other nodes open the standard panel:

```ts
// add imports:
import { workflowView } from './scene/workflow-view.js';
import { renderWorkflowView } from './ui/workflow.js';

// replace the onNodeClick wiring:
handle.onNodeClick((node) => {
  if (node.type === 'workflow-def') {
    const meta = data.workflows[node.id] ?? { phases: [] };
    renderWorkflowView(panel, workflowView(data.model, node, meta));
  } else {
    renderPanel(panel, data.model, overlays, node);
  }
});
```

- [ ] **Step 7: Typecheck, build, test, run, verify**

```bash
pnpm --filter @voidcorp/graph-studio typecheck
pnpm --filter @voidcorp/graph-studio build
pnpm vitest run apps/graph-studio
pnpm --filter @voidcorp/graph-studio dev
```

Expected: clean typecheck/build; workflow-view tests pass; clicking a `workflow-def` node (green) opens the phase schematic + neighbor list with a visible "run replay is P2" note; clicking other nodes still opens the standard panel.

- [ ] **Step 8: Commit**

```bash
git add apps/graph-studio/src/scene/workflow-view.ts apps/graph-studio/src/scene/workflow-view.test.ts apps/graph-studio/src/ui/workflow.ts apps/graph-studio/src/main.ts
git commit -m "feat(graph-studio): workflow-def viewer (phase schematic + neighbors)

Why: the Workflows layer lets a maintainer inspect a workflow definition's
phases and wiring now; the animated run replay is honestly deferred to P2
where activation events exist."
```

---

### Task 12: Holographic HUD pass (bloom, fog, ambient field, reticle, boot intro)

**Files:**
- Create: `apps/graph-studio/src/render/postfx.ts`
- Create: `apps/graph-studio/src/render/reticle.ts`
- Create: `apps/graph-studio/src/render/intro.ts`
- Modify: `apps/graph-studio/src/render/graph.ts` (emissive node objects + frequency halos; call postfx; accept usage)
- Modify: `apps/graph-studio/src/main.ts` (reticle + camera focus on select; play the boot intro once)

**Interfaces:**
- Consumes: `three`, `gsap`, the 3d-force-graph instance; `UsageSummary` (Task 2); `sizeForLines`/`colorForType`/`haloForCount` (Task 3); `focusNode` (Task 7).
- Produces: `addHologramFx(graph): void` (bloom + fog + ambient particle field, with resize handling); `createReticle(graph): Reticle`; `moveReticleTo(reticle, node): void`; `playIntro(graph): void`.

This is the **cinematic pass** that realizes the Design Language section — entirely imperative shell (smoke-verified, no unit tests). **Source-driven (mandatory):** before writing, confirm against the installed versions: `3d-force-graph` `.postProcessingComposer()`, `.scene()`, `.camera()`, `.nodeThreeObject()`, `.onNodeHover()`, `.cameraPosition()`; and that `three/examples/jsm/postprocessing/UnrealBloomPass.js` exists in the installed `three`. Honor `prefers-reduced-motion` (skip intro + pulsing).

- [ ] **Step 1: Write `apps/graph-studio/src/render/postfx.ts`**

```ts
import { CanvasTexture, FogExp2, Points, BufferGeometry, Float32BufferAttribute, PointsMaterial, Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

interface FxGraph {
  scene(): { fog: unknown; add(o: unknown): void };
  postProcessingComposer(): { addPass(p: unknown): void; setSize(w: number, h: number): void };
  width?: number;
  height?: number;
}

/** A soft radial-gradient sprite texture used for node glow halos. */
export function glowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/** Bloom glow + depth fog + a slow ambient particle field — the holographic void. */
export function addHologramFx(graph: FxGraph): void {
  const scene = graph.scene();
  scene.fog = new FogExp2(0x04060d, 0.0011);

  // Bloom: makes the neon node/edge colors read as projected light.
  const bloom = new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 1.1, 0.7, 0.05);
  graph.postProcessingComposer().addPass(bloom);

  // Ambient dust/star field drifting in the background for parallax + life.
  const count = 1400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 1) positions[i] = (i % 7 === 0 ? -1 : 1) * (300 + ((i * 53) % 1400));
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const field = new Points(geo, new PointsMaterial({ color: 0x2a5a78, size: 1.4, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(field);

  const onResize = (): void => {
    bloom.setSize(window.innerWidth, window.innerHeight);
    graph.postProcessingComposer().setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);
}
```

Note: the ambient-field positions above use a deterministic index expression rather than `Math.random()` (which is fine here — this is render shell, not pure code — but the determinism keeps the look stable). Replace with `Math.random()`-seeded positions if you prefer a more organic scatter; either is acceptable in the imperative shell.

- [ ] **Step 2: Write `apps/graph-studio/src/render/reticle.ts`**

```ts
import { gsap } from 'gsap';
import { Group, Mesh, RingGeometry, MeshBasicMaterial, DoubleSide } from 'three';
import type { GraphNode } from '@voidcorp/harness-graph';

interface Positioned { x?: number; y?: number; z?: number }
interface ReticleGraph { scene(): { add(o: unknown): void } }

export interface Reticle {
  readonly group: Group;
}

/** A rotating targeting ring added to the scene, hidden until a node is selected. */
export function createReticle(graph: ReticleGraph): Reticle {
  const group = new Group();
  const ring = new Mesh(
    new RingGeometry(14, 16, 48),
    new MeshBasicMaterial({ color: 0x36e0ff, side: DoubleSide, transparent: true, opacity: 0.9 }),
  );
  group.add(ring);
  group.visible = false;
  graph.scene().add(group);
  gsap.to(group.rotation, { z: Math.PI * 2, duration: 6, repeat: -1, ease: 'none' });
  return { group };
}

/** Snap the reticle onto a node with a quick scale-in (the "lock-on" beat). */
export function moveReticleTo(reticle: Reticle, node: GraphNode & Positioned): void {
  const g = reticle.group;
  g.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
  g.visible = true;
  gsap.fromTo(g.scale, { x: 2.4, y: 2.4, z: 2.4 }, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(2)' });
}
```

- [ ] **Step 3: Write `apps/graph-studio/src/render/intro.ts`**

```ts
import { gsap } from 'gsap';

interface IntroGraph {
  cameraPosition(pos: { x: number; y: number; z: number }, lookAt: { x: number; y: number; z: number }, ms: number): void;
}

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One-time boot sequence: a "SYSTEM ONLINE" overlay fades while the camera sweeps in. */
export function playIntro(graph: IntroGraph): void {
  const overlay = document.createElement('div');
  overlay.textContent = 'SYSTEM ONLINE';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '50', display: 'grid', placeItems: 'center',
    background: 'radial-gradient(ellipse at center, rgba(4,6,13,0.6), #04060d)',
    color: '#36e0ff', font: "700 28px/1 Orbitron, monospace", letterSpacing: '0.4em',
    textShadow: '0 0 24px rgba(54,224,255,0.7)', pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(overlay);

  if (reduced()) {
    overlay.remove();
    return;
  }
  graph.cameraPosition({ x: 0, y: 80, z: 900 }, { x: 0, y: 0, z: 0 }, 0);
  graph.cameraPosition({ x: 0, y: 0, z: 360 }, { x: 0, y: 0, z: 0 }, 1600);
  gsap.to(overlay, { opacity: 0, duration: 0.7, delay: 0.9, ease: 'power2.in', onComplete: () => overlay.remove() });
}
```

- [ ] **Step 4: Upgrade nodes to glowing objects + halos in `render/graph.ts`**

Change `createGraph` to accept `usage` and render each node as a bloom-friendly unlit sphere plus a frequency-scaled glow sprite (this finally renders the "halo = invocation frequency" encoding), and call `addHologramFx` once. Add imports and adjust the signature:

```ts
// add imports:
import { Color, Group, Mesh, MeshBasicMaterial, SphereGeometry, Sprite, SpriteMaterial } from 'three';
import type { UsageSummary } from '../data/types.js';
import { haloForCount } from '../scene/encode.js';
import { addHologramFx, glowTexture } from './postfx.js';

// change the factory signature to:
export function createGraph(el: HTMLElement, model: GraphModel, overlays: Overlays, usage: UsageSummary): GraphHandle {
  // ... existing packs/anchorOf setup unchanged ...

  const halo = glowTexture();
  const graph = ForceGraph3D()(el)
    .backgroundColor('#04060d')
    .nodeId('id')
    .nodeLabel((n) => `${(n as GraphNode).id} (${(n as GraphNode).lines} lines)`)
    .nodeThreeObject((raw) => {
      const n = raw as GraphNode;
      const r = sizeForLines(n.lines);
      const color = new Color(colorForType(n.type));
      const group = new Group();
      group.add(new Mesh(new SphereGeometry(r, 16, 16), new MeshBasicMaterial({ color })));
      const glow = haloForCount(usage.counts[n.name] ?? 0);
      if (glow > 0) {
        const sprite = new Sprite(new SpriteMaterial({ map: halo, color, transparent: true, opacity: glow * 0.6, depthWrite: false }));
        sprite.scale.setScalar(r * (3 + glow * 4));
        group.add(sprite);
      }
      return group;
    })
    .linkColor((l) => FAMILY_EDGE_COLORS[familyOf((l as { kind: GraphModel['edges'][number]['kind'] }).kind)])
    .linkOpacity(0.5)
    .linkWidth(0.6)
    .linkDirectionalParticles((l) => (familyOf((l as { kind: GraphModel['edges'][number]['kind'] }).kind) === 'routing' ? 2 : 0))
    .linkDirectionalParticleWidth(1.4)
    .linkDirectionalParticleSpeed(0.006);

  addHologramFx(graph as never);

  // ... existing d3Force cluster setup, setView, onNodeClick unchanged ...
}
```

(The `.nodeColor`/`.nodeVal` calls from Task 7 are now replaced by `.nodeThreeObject`; remove the two old lines. Keep `applyAnalysisStyling` working by styling `nodeColor` — note that with a custom `nodeThreeObject`, analysis dimming must recolor the sphere material; if `nodeColor` no longer drives the custom object, move the Analysis dimming to toggle `field`/material opacity or re-build node objects. Simplest reconciliation: in `applyAnalysisStyling`, when active, set `graph.nodeThreeObject(dimBuilder)` and when inactive restore the glow builder. Factor the node-object builder into a named function `buildNodeObject(n, usage, halo, dim)` and have both the constructor and `applyAnalysisStyling` call it.)

- [ ] **Step 5: Wire usage, reticle, camera focus, and intro into `main.ts`**

```ts
// add imports:
import { focusNode } from './render/camera.js';
import { createReticle, moveReticleTo } from './render/reticle.js';
import { playIntro } from './render/intro.js';

// change the createGraph call to pass usage:
const handle = createGraph(scene, data.model, overlays, data.usage);

// after handle.setView(state):
const reticle = createReticle(handle.graph as never);

// extend the onNodeClick handler (wrap the existing panel/workflow logic):
handle.onNodeClick((node) => {
  moveReticleTo(reticle, node as never);
  focusNode(handle.graph as never, node as never);
  if (node.type === 'workflow-def') {
    const meta = data.workflows[node.id] ?? { phases: [] };
    renderWorkflowView(panel, workflowView(data.model, node, meta));
  } else {
    renderPanel(panel, data.model, overlays, node);
  }
});

// at the end of main.ts, after controls are rendered:
playIntro(handle.graph as never);
```

- [ ] **Step 6: Typecheck, build, lint, run, verify the full cinematic look**

```bash
pnpm --filter @voidcorp/graph-studio typecheck
pnpm --filter @voidcorp/graph-studio build
pnpm lint
pnpm --filter @voidcorp/graph-studio dev
```

Expected: clean typecheck/build/lint; on load, a "SYSTEM ONLINE" overlay fades while the camera sweeps in; nodes glow (bloom) with frequency halos, distant ones fade into fog; an ambient dust field drifts behind; routing edges carry faint flowing particles; clicking a node snaps a rotating cyan reticle onto it, frames the camera, and opens the glassmorphic HUD panel with animated corner brackets + scanline. With `prefers-reduced-motion`, the intro and pulsing are skipped but the scene still renders.

- [ ] **Step 7: Commit**

```bash
git add apps/graph-studio/src/render/postfx.ts apps/graph-studio/src/render/reticle.ts apps/graph-studio/src/render/intro.ts apps/graph-studio/src/render/graph.ts apps/graph-studio/src/main.ts
git commit -m "feat(graph-studio): holographic HUD pass (bloom, fog, reticle, boot intro)

Why: the maintainer console should feel like a JARVIS/Alita hologram, not a
neutral chart; bloom-lit nodes, depth fog, an ambient field, a lock-on
reticle, and a boot sequence make the graph read as projected light while
keeping the data legible (reduced-motion respected)."
```

---

### Task 13: README, docs, decisions, and final verification

**Files:**
- Create: `apps/graph-studio/README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/specs/2026-06-26-harness-graph-viz.md` (mark §7 implemented)

**Interfaces:**
- Produces: documentation that satisfies the repo meta-rule "any new convention added in a commit MUST be reflected in docs/*.md in the same commit" and "any non-obvious decision MUST be logged in docs/DECISIONS.md".

- [ ] **Step 1: Write `apps/graph-studio/README.md`**

```markdown
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

- **Structure** — nodes (size = lines, color = type, clustered by pack); edges filterable by the four families.
- **Analysis** — conflict halos, muted orphans, hole markers, overlap tension edges (from `analyze()` findings).
- **Flow** — GSAP particle impulse along `routes-to`/`composes` ("Play flow").
- **Workflows** — click a `workflow-def` for its phase schematic + neighbors (run replay is P2).

## Boundaries

Pure core (`src/scene/*`, `src/data/summarize.ts`, `src/data/extract-meta.ts`,
`src/ui/state.ts`) is unit-tested. Three.js/GSAP/DOM (`src/render/*`, `src/ui/*`)
is the imperative shell, verified by `vite build` + manual run (no WebGL unit tests).
```

- [ ] **Step 2: Add the `apps/` boundary to `docs/ARCHITECTURE.md`**

Read `docs/ARCHITECTURE.md`, find the section describing package boundaries / dependency direction, and add an `apps/` entry. Use this text (adapt the heading to the file's existing style):

```markdown
## apps/ (surfaces)

`apps/*` are private, unpublished surfaces that consume the packages. They may
depend on `packages/*` (e.g. `apps/graph-studio` devDepends on
`@voidcorp/harness-graph`), never the reverse. They are exempt from the 400-line
skill cap (they are apps, not skills) and from version lockstep (private, not
shipped). `apps/graph-studio` is the maintainer 3D view of the component graph
(spec §7): a Node prebuild runs the kernel's `analyze()` into static JSON, and the
browser bundle is a pure renderer of that JSON (functional core / imperative shell,
the same split the kernel uses).
```

- [ ] **Step 3: Log the decisions in `docs/DECISIONS.md`**

Read `docs/DECISIONS.md`, match its existing entry format (date-prefixed), and append:

```markdown
## 2026-06-26 — graph-studio consumes the kernel via a static prebuild, not a runtime import

**Decision:** `apps/graph-studio` does not import `@voidcorp/harness-graph` into
the browser bundle. A Node prebuild (`scripts/prepare-data.ts`, run by tsx) reads
`model.json` + `.void/usage.log`, runs the kernel's `analyze()`, and writes four
static JSON blobs the browser renders.

**Why:** keeps `node:fs` (the kernel's `derive/` adapter) out of the bundle, keeps
analysis single-sourced in the kernel (no duplicated detector logic), and requires
zero edits to the already-merged kernel package (no browser-safe subpath export).
The cost — findings are computed at build time, not live — is acceptable for the
P1 static maintainer view; the live consumer surface is P2.

**Alternative rejected:** a browser-safe `@voidcorp/harness-graph/analyze` subpath
export imported at runtime. Cleaner data freshness, but edits a merged package and
risks bundling the fs adapter.

## 2026-06-26 — prior art reviewed: patoles/agent-flow (mined for P2, not P1)

**Decision:** agent-flow (live runtime agent visualizer, React/Next + 2D canvas +
SSE hook server) was reviewed. Borrowed for Plan B: its render decomposition into
small focused draw-modules and isolated camera/interaction/particles concerns.
Deferred to P2 as reference: its JSONL event schema (parentId/runtime/sessionId →
our `activations.jsonl`), its HTTP-hook → SSE transport (→ `graph live`), and its
timeline/scrubber (→ replay). Its 2D-canvas/React stack and run-physics data model
were not adopted (we are locked on 3D / 3d-force-graph and a structural model).
```

- [ ] **Step 4: Mark §7 implemented in the spec**

In `docs/specs/2026-06-26-harness-graph-viz.md`, update the §7 heading line to note Plan B is implemented. Change:

```markdown
## 7. Vue 3D mainteneur (`apps/graph-studio`)
```

to:

```markdown
## 7. Vue 3D mainteneur (`apps/graph-studio`) — IMPLEMENTED (Plan B, M4+M5)
```

- [ ] **Step 5: Run the full repo gate exactly as CI does**

```bash
pnpm --filter @voidcorp/harness-graph build
pnpm --filter @voidcorp/graph-studio prepare-data
pnpm lint
pnpm build
pnpm graph:check
pnpm vitest run
pnpm -r typecheck
pnpm sync:docs
pnpm anti-bloat:check
pnpm version:check
```

Expected: every command exits 0. (`pnpm build` builds the studio via `vite build`; `pnpm vitest run` includes all `apps/graph-studio` pure-core tests; `pnpm -r typecheck` covers the app; docs/version/anti-bloat checks stay green since the app adds no skill and no versioned manifest.)

- [ ] **Step 6: Commit**

```bash
git add apps/graph-studio/README.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/specs/2026-06-26-harness-graph-viz.md
git commit -m "docs(graph-studio): README, architecture boundary, decisions, spec status

Why: the meta-rules require new conventions (apps/ boundary) and non-obvious
decisions (static-prebuild seam, agent-flow prior-art) to land in docs in the
same change; spec §7 is now implemented."
```

---

## Self-Review

**Spec coverage (§7):**
- Stack (Vite + 3d-force-graph + GSAP, no backend P1) — Tasks 1, 7, 10. ✔
- Encoding (size = lines, color = type, halo = invocation freq, clusters by pack) — Task 3 (`sizeForLines`, `colorForType`, `haloForCount`, `clusterAnchor`) + Task 7 (applied). ✔
- Layers Structure / Analyse / Flux / Workflows — Tasks 6 (selection), 7 (structure), 9 (analysis), 10 (flow), 11 (workflows). ✔
- Edge filtering by the four families — Task 4 + Task 6. ✔
- Interaction: click → side panel (description, lines, edges, evidence/flags, source link); search; filter; camera focus — Task 8 (panel/controls) + Task 7 (`focusNode`). ✔
- Loads `model.json` + usage summary + findings — Task 2 (prebuild) + Task 7 (`loadData`). ✔
- Workflow-def DAG sub-view; run replay when events exist (P2) — Task 11 (schematic + explicit P2 note). ✔
- Tests: pure model→scene transforms + smoke build, not WebGL — Tasks 2-6, 8, 10, 11 (vitest) + Tasks 7, 9 (build smoke). ✔ (spec §11)
- Error/edge cases: malformed/missing usage.log → empty summary (Task 2); unknown finding kinds ignored (Task 5); workflow without phases tolerated (Tasks 2, 11). ✔ (spec §10)

**Aesthetic (user direction — holographic JARVIS/Alita HUD):** Design Language
section (palette, pillars) + Task 12 (bloom, fog, ambient field, lock-on reticle,
boot intro) + HUD CSS in Tasks 1/8 + neon node hues in Task 3. Frequency halos
(spec encoding) are realized by Task 12's glowing node objects. Legibility and the
analysis signals stay primary; `prefers-reduced-motion` honored. ✔

**Placeholder scan:** No TBD/TODO left as deliverables. The only deferred item (workflow run replay) is an explicit, spec-sanctioned P2 boundary rendered as a user-facing note, not a code gap. The temporary `console.info` probe in Task 7 is explicitly removed in Task 8.

**Type consistency:** `ViewState`/`LayerName`/`Family` defined in Tasks 4/6 and reused unchanged in Tasks 8-11; `Overlays` defined in Task 5 and consumed in Tasks 8/9; `StudioData`/`loadData` from Task 7 used in Tasks 8-11; `WorkflowMeta`/`WorkflowPhase` from Task 2 used in Tasks 2/11; `createGraph` grows by one argument twice — `overlays` in Task 9, `usage` in Task 12 — and its single caller in `main.ts` is updated in the same task each time (the only call site). `flowChain` named consistently in Task 10. No unresolved signature drift.

**Out of scope (intentional):** M6 telemetry seed (`activations.jsonl`) — it is a hooks concern, not the app; left for a separate plan per the brief. The live consumer surface, run replay, and behavioral "should-have-fired" analysis are P2.

---

## Execution Handoff

Per the kickoff brief, execute **subagent-driven** (like Plan A): one fresh subagent per task, two-stage review between tasks.

- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development.
