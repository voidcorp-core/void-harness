# harness-graph kernel + analyses + CLI + telemetry seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, testable core of the harness visualization — a graph model of every skill/agent/hook/command/pack/workflow plus their relations, the static analyses over it, the `void-harness graph` CLI, and the enriched telemetry that seeds Phase 2.

**Architecture:** A new pure-TS package `packages/harness-graph` is the single source of truth: `derive/` scans the repo for nodes + mechanical edges, `relations/` loads declared semantic edges, `build-model.ts` assembles `model.json`, `analyze/` runs detectors. The CLI gains a thin `graph` command (`build` / `check` / `audit`) that orchestrates the kernel — same functional-core / imperative-shell split as the existing `audit` command. A CI gate runs `graph check`.

**Tech Stack:** TypeScript (strict, ESM/NodeNext), tsup (build), vitest (test), biome (lint), pnpm workspace. No runtime deps in the kernel beyond Node built-ins + a tiny YAML parse (use `node:` + a hand-rolled minimal loader is rejected; add `yaml@^2` as the one dependency). This is Plan A of two — Plan B (the `apps/graph-studio` Three.js view) consumes `model.json` and is planned separately.

## Global Constraints

- pnpm `9.15.9`; Node `>=20`; package `"type": "module"`, imports use explicit `.js` specifiers.
- TypeScript strict: zero `any`, discriminated unions over enums, `satisfies` over `as`, exhaustive switches via `never`.
- Functional core / imperative shell: kernel libs are pure (no I/O except the `derive/` filesystem adapter and the CLI shell); no `console.log` in committed kernel code — rendering lives in the CLI command via `packages/cli/src/lib/render.ts`.
- Conventional commits; every body ends with the **why**. ASCII only (no em dash, no emoji as filler). Co-author trailer for the AI pair.
- Determinism: `model.json` node/edge ordering is stable (sorted by id, then kind). `Date.now()` only in the CLI shell, injected into pure functions.
- Mirror discipline: `packages/harness-graph` is NOT under `packages/core`, so it is NOT copied into `core-assets`; it is a normal workspace package added to `pnpm-workspace.yaml`.

---

### Task 1: Scaffold the `harness-graph` package

**Files:**
- Create: `packages/harness-graph/package.json`
- Create: `packages/harness-graph/tsconfig.json`
- Create: `packages/harness-graph/tsup.config.ts`
- Create: `packages/harness-graph/src/index.ts`
- Create: `packages/harness-graph/src/smoke.test.ts`
- Modify: `pnpm-workspace.yaml` (add the package)

**Interfaces:**
- Produces: a buildable workspace package `@voidcorp/harness-graph` exporting from `src/index.ts`.

- [ ] **Step 1: Add the package to the workspace**

In `pnpm-workspace.yaml`, under `packages:`, add the line:

```yaml
  - 'packages/harness-graph'
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@voidcorp/harness-graph",
  "version": "0.12.1",
  "description": "void-harness graph kernel — derive the skill/agent/hook/pack/workflow graph, declared relations, and static analyses (the source of truth the studio renders).",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public" },
  "dependencies": { "yaml": "^2.5.0" },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "extends": "../packs/pack-monorepo/tsconfig.strict.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src", "module": "NodeNext", "moduleResolution": "NodeNext" },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"]
}
```

If `../packs/pack-monorepo/tsconfig.strict.json` is not resolvable from here, copy the strict compiler options inline instead (run `cat packages/packs/pack-monorepo/tsconfig.strict.json` to read them).

- [ ] **Step 4: Write `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

- [ ] **Step 5: Write the smoke test `src/smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION } from './index.js';

describe('harness-graph kernel', () => {
  it('exposes a version constant', () => {
    expect(KERNEL_VERSION).toBe(1);
  });
});
```

- [ ] **Step 6: Write `src/index.ts`**

```ts
export const KERNEL_VERSION = 1 as const;
```

- [ ] **Step 7: Install and verify build + test**

Run: `pnpm install && pnpm --filter @voidcorp/harness-graph build && pnpm --filter @voidcorp/harness-graph test`
Expected: install succeeds, build emits `dist/index.js`, 1 test passes.

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml packages/harness-graph pnpm-lock.yaml
git commit -m "feat(harness-graph): scaffold the graph kernel package

Why: the visualization needs a single pure-TS source of truth for the
component graph, separate from the CLI shell and from packages/core."
```

---

### Task 2: The graph model types

**Files:**
- Create: `packages/harness-graph/src/model/types.ts`
- Create: `packages/harness-graph/src/model/types.test.ts`

**Interfaces:**
- Produces: `NodeType`, `EdgeKind`, `EdgeOrigin`, `GraphNode`, `GraphEdge`, `GraphModel`, `nodeId(type, name, pack)`.

- [ ] **Step 1: Write the failing test `src/model/types.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { nodeId } from './types.js';

describe('nodeId', () => {
  it('namespaces a core node by type and name', () => {
    expect(nodeId('skill', 'tdd', null)).toBe('skill:tdd');
  });
  it('namespaces a pack node by pack folder', () => {
    expect(nodeId('skill', 'cache-component-pattern', 'pack-nextjs')).toBe('skill:pack-nextjs/cache-component-pattern');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @voidcorp/harness-graph test src/model/types.test.ts`
Expected: FAIL — cannot find `./types.js`.

- [ ] **Step 3: Write `src/model/types.ts`**

```ts
export type NodeType = 'skill' | 'agent' | 'hook' | 'command' | 'pack' | 'workflow-def';
export type EdgeKind =
  | 'routes-to'
  | 'composes'
  | 'conflicts'
  | 'overlaps'
  | 'companion-of'
  | 'invokes'
  | 'extends';
export type EdgeOrigin = 'derived' | 'declared';

export interface GraphNode {
  readonly id: string;
  readonly type: NodeType;
  readonly name: string;
  readonly description: string;
  readonly lines: number;
  readonly pack: string | null;
  readonly source: string;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly origin: EdgeOrigin;
  readonly evidence: string;
}

export interface GraphModel {
  readonly version: 1;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** Stable node id: `type:name` for core, `type:pack/name` for a pack-scoped node. */
export function nodeId(type: NodeType, name: string, pack: string | null): string {
  return pack ? `${type}:${pack}/${name}` : `${type}:${name}`;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @voidcorp/harness-graph test src/model/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/model
git commit -m "feat(harness-graph): graph model types + stable node ids

Why: the model is the contract both surfaces (maintainer/structure,
consumer/live) share; stable ids make model.json diffable."
```

---

### Task 3: Frontmatter + LOC reader

**Files:**
- Create: `packages/harness-graph/src/derive/read-frontmatter.ts`
- Create: `packages/harness-graph/src/derive/read-frontmatter.test.ts`

**Interfaces:**
- Produces: `readFrontmatter(text): { description: string }`, `countLines(text): number`. Pure — operate on file content, not paths.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { countLines, readFrontmatter } from './read-frontmatter.js';

describe('readFrontmatter', () => {
  it('extracts the description field', () => {
    const md = '---\nname: tdd\ndescription: TDD with three modes.\n---\n\n# tdd\n';
    expect(readFrontmatter(md).description).toBe('TDD with three modes.');
  });
  it('returns empty description when absent', () => {
    expect(readFrontmatter('# no frontmatter\n').description).toBe('');
  });
});

describe('countLines', () => {
  it('counts newline-separated lines', () => {
    expect(countLines('a\nb\nc')).toBe(3);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/derive/read-frontmatter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/derive/read-frontmatter.ts`**

```ts
export function readFrontmatter(text: string): { description: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { description: '' };
  const block = match[1] ?? '';
  const line = block.split('\n').find((l) => l.startsWith('description:'));
  const description = line ? line.slice('description:'.length).trim() : '';
  return { description };
}

export function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness-graph test src/derive/read-frontmatter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/derive/read-frontmatter.ts packages/harness-graph/src/derive/read-frontmatter.test.ts
git commit -m "feat(harness-graph): pure frontmatter + LOC readers

Why: node metadata (description, lines) drives both the anti-bloat
signal and the studio's visual encoding; keep extraction pure/testable."
```

---

### Task 4: Node deriver (filesystem adapter + pure assembler)

**Files:**
- Create: `packages/harness-graph/src/derive/nodes.ts`
- Create: `packages/harness-graph/src/derive/nodes.test.ts`

**Interfaces:**
- Consumes: `GraphNode`, `nodeId` (Task 2); `readFrontmatter`, `countLines` (Task 3).
- Produces: `deriveNodes(tree: SourceTree): GraphNode[]` where `SourceTree` is an injected, in-memory description of the repo (so the function stays pure and testable); plus `scanSourceTree(coreDir, packsDir): SourceTree` (the one filesystem adapter).

- [ ] **Step 1: Write the failing test (pure assembler, fixture tree)**

```ts
import { describe, expect, it } from 'vitest';
import { deriveNodes } from './nodes.js';

const tree = {
  skills: [
    { name: 'tdd', pack: null, source: 'packages/core/skills/tdd/SKILL.md', text: '---\ndescription: TDD modes.\n---\nbody\n' },
    { name: 'cache', pack: 'pack-nextjs', source: 'packages/packs/pack-nextjs/claude/skills/cache/SKILL.md', text: '---\ndescription: cache.\n---\n' },
  ],
  agents: [{ name: 'doctrine-critic', source: 'packages/core/agents/doctrine-critic.md', text: '---\ndescription: judge.\n---\n' }],
  hooks: [{ name: 'tdd-guard', source: 'packages/core/hooks/tdd-guard.sh', text: '#!/bin/sh\n' }],
  commands: [{ name: 'backlog-autopilot', source: 'packages/core/commands/backlog-autopilot.md', text: '---\ndescription: cmd.\n---\n' }],
  packs: [{ name: 'pack-nextjs', source: 'packages/packs/pack-nextjs', text: '' }],
  workflowDefs: [{ name: 'backlog-autopilot', source: 'packages/core/skills/backlog-autopilot/workflows/backlog-autopilot.workflow.js', text: '' }],
};

describe('deriveNodes', () => {
  it('produces one node per component with a stable id', () => {
    const ids = deriveNodes(tree).map((n) => n.id);
    expect(ids).toContain('skill:tdd');
    expect(ids).toContain('skill:pack-nextjs/cache');
    expect(ids).toContain('agent:doctrine-critic');
    expect(ids).toContain('hook:tdd-guard');
    expect(ids).toContain('command:backlog-autopilot');
    expect(ids).toContain('pack:pack-nextjs');
    expect(ids).toContain('workflow-def:backlog-autopilot');
  });

  it('carries description and lines for a skill', () => {
    const tdd = deriveNodes(tree).find((n) => n.id === 'skill:tdd');
    expect(tdd?.description).toBe('TDD modes.');
    expect(tdd?.lines).toBeGreaterThan(0);
    expect(tdd?.pack).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/derive/nodes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/derive/nodes.ts`**

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type GraphNode, type NodeType, nodeId } from '../model/types.js';
import { countLines, readFrontmatter } from './read-frontmatter.js';

export interface SourceEntry {
  readonly name: string;
  readonly pack?: string | null;
  readonly source: string;
  readonly text: string;
}
export interface SourceTree {
  readonly skills: readonly SourceEntry[];
  readonly agents: readonly SourceEntry[];
  readonly hooks: readonly SourceEntry[];
  readonly commands: readonly SourceEntry[];
  readonly packs: readonly SourceEntry[];
  readonly workflowDefs: readonly SourceEntry[];
}

function toNode(type: NodeType, e: SourceEntry): GraphNode {
  const pack = e.pack ?? null;
  return {
    id: nodeId(type, e.name, pack),
    type,
    name: e.name,
    description: readFrontmatter(e.text).description,
    lines: countLines(e.text),
    pack,
    source: e.source,
  };
}

/** Pure: assemble nodes from an in-memory tree (inject in tests). */
export function deriveNodes(tree: SourceTree): GraphNode[] {
  return [
    ...tree.skills.map((e) => toNode('skill', e)),
    ...tree.agents.map((e) => toNode('agent', e)),
    ...tree.hooks.map((e) => toNode('hook', e)),
    ...tree.commands.map((e) => toNode('command', e)),
    ...tree.packs.map((e) => toNode('pack', e)),
    ...tree.workflowDefs.map((e) => toNode('workflow-def', e)),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

/** Filesystem adapter: read the real repo into a SourceTree. */
export function scanSourceTree(coreDir: string, packsDir: string): SourceTree {
  const skills: SourceEntry[] = [];
  const skillsDir = join(coreDir, 'skills');
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      const f = join(skillsDir, name, 'SKILL.md');
      if (existsSync(f)) skills.push({ name, pack: null, source: rel(f), text: readFileSync(f, 'utf8') });
    }
  }
  const agents = readMdDir(join(coreDir, 'agents'));
  const hooks = readDir(join(coreDir, 'hooks'), '.sh');
  const commands = readMdDir(join(coreDir, 'commands'));
  const packs: SourceEntry[] = [];
  const workflowDefs: SourceEntry[] = [];
  if (existsSync(packsDir)) {
    for (const pack of readdirSync(packsDir)) {
      packs.push({ name: pack, pack: null, source: rel(join(packsDir, pack)), text: '' });
      const packSkillsDir = join(packsDir, pack, 'claude', 'skills');
      if (existsSync(packSkillsDir)) {
        for (const name of readdirSync(packSkillsDir)) {
          const f = join(packSkillsDir, name, 'SKILL.md');
          if (existsSync(f)) skills.push({ name, pack, source: rel(f), text: readFileSync(f, 'utf8') });
        }
      }
    }
  }
  // workflow defs live next to skills as *.workflow.js
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      const wfDir = join(skillsDir, name, 'workflows');
      if (!existsSync(wfDir)) continue;
      for (const f of readdirSync(wfDir)) {
        if (f.endsWith('.workflow.js')) {
          workflowDefs.push({ name: f.replace(/\.workflow\.js$/, ''), source: rel(join(wfDir, f)), text: '' });
        }
      }
    }
  }
  return { skills, agents, hooks, commands, packs, workflowDefs };
}

function readMdDir(dir: string): SourceEntry[] {
  return readDir(dir, '.md');
}
function readDir(dir: string, ext: string): SourceEntry[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => {
      const full = join(dir, f);
      return { name: f.slice(0, -ext.length), source: rel(full), text: readFileSync(full, 'utf8') };
    });
}
function rel(abs: string): string {
  const marker = '/void-harness/';
  const i = abs.lastIndexOf(marker);
  return i >= 0 ? abs.slice(i + marker.length) : abs;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness-graph test src/derive/nodes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/derive/nodes.ts packages/harness-graph/src/derive/nodes.test.ts
git commit -m "feat(harness-graph): derive nodes from core + packs

Why: nodes are the spine of the graph; keep the assembler pure and put
all filesystem reads behind a single scanSourceTree adapter."
```

---

### Task 5: Mechanical edge deriver

**Files:**
- Create: `packages/harness-graph/src/derive/edges.ts`
- Create: `packages/harness-graph/src/derive/edges.test.ts`

**Interfaces:**
- Consumes: `GraphNode`, `GraphEdge` (Task 2); `SourceTree` (Task 4).
- Produces: `deriveEdges(tree, nodes): GraphEdge[]` — emits `companion-of`, `invokes`, `extends` (all `origin: 'derived'`).

Rules (deterministic):
- `companion-of`: a `hook` node whose name equals or starts with a `skill` name (e.g. `tdd-guard` ↔ `tdd`) → edge `hook -> skill`, evidence `"naming convention: <hook> guards <skill>"`.
- `invokes`: an `agent` whose source text contains the literal skill name as `` `skill:<name>` `` or `skill: <name>` → edge `agent -> skill`, evidence the matched line.
- `extends`: a pack `skill` node whose `name` equals a core `skill` name → edge `pack-skill -> core-skill`, evidence `"pack <pack> overlays core skill <name>"`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { deriveNodes } from './nodes.js';
import { deriveEdges } from './edges.js';

const tree = {
  skills: [
    { name: 'tdd', pack: null, source: 's', text: '---\ndescription: x\n---\n' },
    { name: 'cache', pack: null, source: 's', text: '---\ndescription: x\n---\n' },
    { name: 'cache', pack: 'pack-nextjs', source: 's', text: '---\ndescription: x\n---\n' },
  ],
  agents: [{ name: 'tdd-guardian', source: 's', text: 'invoke skill: tdd when planning.' }],
  hooks: [{ name: 'tdd-guard', source: 's', text: '#!/bin/sh\n' }],
  commands: [],
  packs: [{ name: 'pack-nextjs', pack: null, source: 's', text: '' }],
  workflowDefs: [],
};

describe('deriveEdges', () => {
  const nodes = deriveNodes(tree);
  const edges = deriveEdges(tree, nodes);

  it('links a guard hook to its skill (companion-of)', () => {
    expect(edges).toContainEqual(
      expect.objectContaining({ from: 'hook:tdd-guard', to: 'skill:tdd', kind: 'companion-of', origin: 'derived' }),
    );
  });
  it('links an agent to a skill it references (invokes)', () => {
    expect(edges).toContainEqual(
      expect.objectContaining({ from: 'agent:tdd-guardian', to: 'skill:tdd', kind: 'invokes', origin: 'derived' }),
    );
  });
  it('links a pack skill to the core skill it overlays (extends)', () => {
    expect(edges).toContainEqual(
      expect.objectContaining({ from: 'skill:pack-nextjs/cache', to: 'skill:cache', kind: 'extends', origin: 'derived' }),
    );
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/derive/edges.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/derive/edges.ts`**

```ts
import { type GraphEdge, type GraphNode, nodeId } from '../model/types.js';
import type { SourceTree } from './nodes.js';

export function deriveEdges(tree: SourceTree, nodes: readonly GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const coreSkillNames = new Set(tree.skills.filter((s) => !s.pack).map((s) => s.name));
  const skillIds = new Set(nodes.filter((n) => n.type === 'skill').map((n) => n.id));

  // companion-of: hook named after / prefixed by a core skill
  for (const hook of tree.hooks) {
    for (const skill of coreSkillNames) {
      if (hook.name === skill || hook.name.startsWith(`${skill}-`)) {
        edges.push({
          from: nodeId('hook', hook.name, null),
          to: nodeId('skill', skill, null),
          kind: 'companion-of',
          origin: 'derived',
          evidence: `naming convention: hook ${hook.name} guards skill ${skill}`,
        });
      }
    }
  }

  // invokes: agent text references a core skill by name
  for (const agent of tree.agents) {
    for (const skill of coreSkillNames) {
      const re = new RegExp(`skill:?\\s*\`?${escapeRe(skill)}\`?`, 'i');
      const m = agent.text.match(re);
      if (m) {
        edges.push({
          from: nodeId('agent', agent.name, null),
          to: nodeId('skill', skill, null),
          kind: 'invokes',
          origin: 'derived',
          evidence: `agent ${agent.name} references "${m[0]}"`,
        });
      }
    }
  }

  // extends: pack skill overlays a core skill of the same name
  for (const s of tree.skills) {
    if (!s.pack) continue;
    if (coreSkillNames.has(s.name)) {
      const from = nodeId('skill', s.name, s.pack);
      const to = nodeId('skill', s.name, null);
      if (skillIds.has(from) && skillIds.has(to)) {
        edges.push({ from, to, kind: 'extends', origin: 'derived', evidence: `pack ${s.pack} overlays core skill ${s.name}` });
      }
    }
  }

  return edges.sort(byEdge);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function byEdge(a: GraphEdge, b: GraphEdge): number {
  return a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind);
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness-graph test src/derive/edges.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/derive/edges.ts packages/harness-graph/src/derive/edges.test.ts
git commit -m "feat(harness-graph): derive mechanical edges (companion/invokes/extends)

Why: the edges a machine can prove belong in the deriver, not the curated
relations file; only ambiguous semantic edges are declared by hand."
```

---

### Task 6: Declared relations loader

**Files:**
- Create: `packages/harness-graph/src/relations/load.ts`
- Create: `packages/harness-graph/src/relations/load.test.ts`

**Interfaces:**
- Consumes: `GraphEdge`, `EdgeKind` (Task 2).
- Produces: `loadDeclaredEdges(yamlText): GraphEdge[]` — parses the `relations.graph.yaml` shape into `origin: 'declared'` edges.

YAML shape:
```yaml
edges:
  - from: skill:brainstorming
    to: skill:writing-plans
    kind: routes-to
    evidence: "brainstorming SKILL.md: 'transition to writing-plans'"
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadDeclaredEdges } from './load.js';

describe('loadDeclaredEdges', () => {
  it('parses declared edges with evidence', () => {
    const yaml = [
      'edges:',
      '  - from: skill:brainstorming',
      '    to: skill:writing-plans',
      '    kind: routes-to',
      '    evidence: "transition to writing-plans"',
    ].join('\n');
    expect(loadDeclaredEdges(yaml)).toEqual([
      { from: 'skill:brainstorming', to: 'skill:writing-plans', kind: 'routes-to', origin: 'declared', evidence: 'transition to writing-plans' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(loadDeclaredEdges('')).toEqual([]);
  });

  it('rejects an unknown edge kind', () => {
    const yaml = 'edges:\n  - from: a\n    to: b\n    kind: bogus\n    evidence: x\n';
    expect(() => loadDeclaredEdges(yaml)).toThrow(/unknown edge kind/i);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/relations/load.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/relations/load.ts`**

```ts
import { parse } from 'yaml';
import type { EdgeKind, GraphEdge } from '../model/types.js';

const KINDS: readonly EdgeKind[] = ['routes-to', 'composes', 'conflicts', 'overlaps', 'companion-of', 'invokes', 'extends'];

interface RawEdge {
  from?: unknown;
  to?: unknown;
  kind?: unknown;
  evidence?: unknown;
}

export function loadDeclaredEdges(yamlText: string): GraphEdge[] {
  if (yamlText.trim() === '') return [];
  const doc = parse(yamlText) as { edges?: readonly RawEdge[] } | null;
  const raw = doc?.edges ?? [];
  return raw.map((e, i) => {
    const from = str(e.from, i, 'from');
    const to = str(e.to, i, 'to');
    const kind = str(e.kind, i, 'kind');
    if (!KINDS.includes(kind as EdgeKind)) throw new Error(`relations[${i}]: unknown edge kind "${kind}"`);
    return { from, to, kind: kind as EdgeKind, origin: 'declared' as const, evidence: str(e.evidence, i, 'evidence') };
  });
}

function str(v: unknown, i: number, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`relations[${i}]: "${field}" must be a non-empty string`);
  return v.trim();
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness-graph test src/relations/load.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/relations
git commit -m "feat(harness-graph): load declared semantic relations from yaml

Why: routing/composition/conflict edges can't be proven mechanically;
declare them with evidence so the graph stays trustworthy and diffable."
```

---

### Task 7: Assemble + serialize the model

**Files:**
- Create: `packages/harness-graph/src/build-model.ts`
- Create: `packages/harness-graph/src/build-model.test.ts`
- Modify: `packages/harness-graph/src/index.ts`

**Interfaces:**
- Consumes: all of derive + relations + `GraphModel` (Tasks 2,4,5,6).
- Produces: `assembleModel(tree, declaredYaml): GraphModel`; `serializeModel(model): string` (stable JSON + trailing newline).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { assembleModel, serializeModel } from './build-model.js';

const tree = {
  skills: [{ name: 'tdd', pack: null, source: 's', text: '---\ndescription: x\n---\n' }],
  agents: [], hooks: [{ name: 'tdd-guard', source: 's', text: '#!/bin/sh\n' }],
  commands: [], packs: [], workflowDefs: [],
};

describe('assembleModel', () => {
  it('merges derived and declared edges and sorts deterministically', () => {
    const model = assembleModel(tree, '');
    expect(model.version).toBe(1);
    expect(model.nodes.map((n) => n.id)).toEqual(['hook:tdd-guard', 'skill:tdd']);
    expect(model.edges).toContainEqual(expect.objectContaining({ kind: 'companion-of', origin: 'derived' }));
  });

  it('serializes stably with a trailing newline', () => {
    const out = serializeModel(assembleModel(tree, ''));
    expect(out.endsWith('\n')).toBe(true);
    expect(serializeModel(assembleModel(tree, ''))).toBe(out); // deterministic
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/build-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/build-model.ts`**

```ts
import { deriveEdges, byEdge } from './derive/edges.js';
import { deriveNodes, type SourceTree } from './derive/nodes.js';
import type { GraphModel } from './model/types.js';
import { loadDeclaredEdges } from './relations/load.js';

export function assembleModel(tree: SourceTree, declaredYaml: string): GraphModel {
  const nodes = deriveNodes(tree);
  const edges = [...deriveEdges(tree, nodes), ...loadDeclaredEdges(declaredYaml)].sort(byEdge);
  return { version: 1, nodes, edges };
}

export function serializeModel(model: GraphModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}
```

- [ ] **Step 4: Re-export from `src/index.ts`**

```ts
export const KERNEL_VERSION = 1 as const;
export * from './model/types.js';
export { scanSourceTree } from './derive/nodes.js';
export { assembleModel, serializeModel } from './build-model.js';
```

- [ ] **Step 5: Run + typecheck**

Run: `pnpm --filter @voidcorp/harness-graph test && pnpm --filter @voidcorp/harness-graph typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/harness-graph/src/build-model.ts packages/harness-graph/src/build-model.test.ts packages/harness-graph/src/index.ts
git commit -m "feat(harness-graph): assemble + stably serialize the model

Why: a deterministic model.json is what makes the CI drift gate and a
clean git diff possible."
```

---

### Task 8: Analysis finding type + detector registry

**Files:**
- Create: `packages/harness-graph/src/analyze/types.ts`
- Create: `packages/harness-graph/src/analyze/types.test.ts`

**Interfaces:**
- Produces: `Severity`, `Finding`, `Detector = (model: GraphModel, ctx: AnalyzeCtx) => Finding[]`, `AnalyzeCtx { usedSkillNames: ReadonlySet<string> }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { isError } from './types.js';

describe('isError', () => {
  it('is true for error severity', () => {
    expect(isError({ kind: 'k', severity: 'error', nodes: [], evidence: 'e', suggestion: 's' })).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isError({ kind: 'k', severity: 'warning', nodes: [], evidence: 'e', suggestion: 's' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/types.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/analyze/types.ts`**

```ts
import type { GraphModel } from '../model/types.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  readonly kind: string;
  readonly severity: Severity;
  readonly nodes: readonly string[];
  readonly evidence: string;
  readonly suggestion: string;
}

export interface AnalyzeCtx {
  readonly usedSkillNames: ReadonlySet<string>;
}

export type Detector = (model: GraphModel, ctx: AnalyzeCtx) => Finding[];

export function isError(f: Finding): boolean {
  return f.severity === 'error';
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/analyze/types.ts packages/harness-graph/src/analyze/types.test.ts
git commit -m "feat(harness-graph): analysis finding type + detector signature

Why: a uniform Finding shape lets the CLI render and the CI gate filter
(error = block) without each detector reinventing its output."
```

---

### Task 9: Detector — broken routes / dangling refs (the CI-blocking one)

**Files:**
- Create: `packages/harness-graph/src/analyze/broken-routes.ts`
- Create: `packages/harness-graph/src/analyze/broken-routes.test.ts`

**Interfaces:**
- Consumes: `Detector`, `Finding` (Task 8); `GraphModel` (Task 2).
- Produces: `brokenRoutes: Detector` — emits `severity: 'error'` for any edge whose `from`/`to` is not a node id.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { brokenRoutes } from './broken-routes.js';

const ctx = { usedSkillNames: new Set<string>() };

describe('brokenRoutes', () => {
  it('flags an edge to a missing node', () => {
    const model = {
      version: 1 as const,
      nodes: [{ id: 'skill:a', type: 'skill' as const, name: 'a', description: '', lines: 1, pack: null, source: 's' }],
      edges: [{ from: 'skill:a', to: 'skill:ghost', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' }],
    };
    const f = brokenRoutes(model, ctx);
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('error');
    expect(f[0]?.nodes).toContain('skill:ghost');
  });

  it('passes a fully connected model', () => {
    const model = {
      version: 1 as const,
      nodes: [
        { id: 'skill:a', type: 'skill' as const, name: 'a', description: '', lines: 1, pack: null, source: 's' },
        { id: 'skill:b', type: 'skill' as const, name: 'b', description: '', lines: 1, pack: null, source: 's' },
      ],
      edges: [{ from: 'skill:a', to: 'skill:b', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' }],
    };
    expect(brokenRoutes(model, ctx)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/broken-routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/analyze/broken-routes.ts`**

```ts
import type { Detector, Finding } from './types.js';

export const brokenRoutes: Detector = (model) => {
  const ids = new Set(model.nodes.map((n) => n.id));
  const out: Finding[] = [];
  for (const e of model.edges) {
    const missing = [e.from, e.to].filter((id) => !ids.has(id));
    if (missing.length === 0) continue;
    out.push({
      kind: 'broken-route',
      severity: 'error',
      nodes: missing,
      evidence: `edge ${e.from} -[${e.kind}]-> ${e.to} references a missing node (${missing.join(', ')})`,
      suggestion: 'fix the node id in relations.graph.yaml, or remove the dangling edge',
    });
  }
  return out;
};
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/broken-routes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/analyze/broken-routes.ts packages/harness-graph/src/analyze/broken-routes.test.ts
git commit -m "feat(harness-graph): detect broken routes / dangling refs

Why: a dangling edge is always a real defect, so this is the one detector
promoted to a blocking CI gate."
```

---

### Task 10: Detector — orphans (composes usage)

**Files:**
- Create: `packages/harness-graph/src/analyze/orphans.ts`
- Create: `packages/harness-graph/src/analyze/orphans.test.ts`

**Interfaces:**
- Consumes: `Detector` (Task 8); `AnalyzeCtx.usedSkillNames`.
- Produces: `orphans: Detector` — a node with zero incident edges AND (for skills) whose `name` is not in `usedSkillNames` → `severity: 'warning'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { orphans } from './orphans.js';

function skill(id: string, name: string) {
  return { id, type: 'skill' as const, name, description: '', lines: 1, pack: null, source: 's' };
}

describe('orphans', () => {
  it('flags an unconnected, never-used skill', () => {
    const model = { version: 1 as const, nodes: [skill('skill:lonely', 'lonely')], edges: [] };
    const f = orphans(model, { usedSkillNames: new Set() });
    expect(f.map((x) => x.nodes[0])).toContain('skill:lonely');
  });

  it('does NOT flag an unconnected skill that has fired', () => {
    const model = { version: 1 as const, nodes: [skill('skill:used', 'used')], edges: [] };
    expect(orphans(model, { usedSkillNames: new Set(['used']) })).toEqual([]);
  });

  it('does NOT flag a connected skill', () => {
    const model = {
      version: 1 as const,
      nodes: [skill('skill:a', 'a'), skill('skill:b', 'b')],
      edges: [{ from: 'skill:a', to: 'skill:b', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' }],
    };
    expect(orphans(model, { usedSkillNames: new Set() })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/orphans.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/analyze/orphans.ts`**

```ts
import type { Detector, Finding } from './types.js';

export const orphans: Detector = (model, ctx) => {
  const incident = new Set<string>();
  for (const e of model.edges) {
    incident.add(e.from);
    incident.add(e.to);
  }
  const out: Finding[] = [];
  for (const n of model.nodes) {
    if (incident.has(n.id)) continue;
    if (n.type === 'skill' && ctx.usedSkillNames.has(n.name)) continue;
    out.push({
      kind: 'orphan',
      severity: 'warning',
      nodes: [n.id],
      evidence: `${n.id} has no relations${n.type === 'skill' ? ' and has never fired in usage.log' : ''}`,
      suggestion: 'wire it into routing/composition, or consider deprecating it (audit is HITL)',
    });
  }
  return out;
};
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/orphans.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/analyze/orphans.ts packages/harness-graph/src/analyze/orphans.test.ts
git commit -m "feat(harness-graph): detect orphan nodes, composing usage data

Why: a node nobody routes to and that never fires is the strongest
deprecation candidate; reuse usage.log instead of a second signal."
```

---

### Task 11: Detector — lexical overlap (anti-bloat >30% signal)

**Files:**
- Create: `packages/harness-graph/src/analyze/overlap.ts`
- Create: `packages/harness-graph/src/analyze/overlap.test.ts`

**Interfaces:**
- Consumes: `Detector` (Task 8).
- Produces: `overlap: Detector` — pairwise Jaccard over each skill description's trigger terms; pairs `>= 0.3` → `severity: 'warning'`, kind `overlap`. Plus exported pure helper `triggerTerms(description): Set<string>` and `jaccard(a, b): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { jaccard, overlap, triggerTerms } from './overlap.js';

describe('triggerTerms', () => {
  it('lowercases and drops short stopwords', () => {
    expect([...triggerTerms('Use when editing TypeScript code')]).toEqual(
      expect.arrayContaining(['editing', 'typescript', 'code']),
    );
  });
});

describe('jaccard', () => {
  it('is 1 for identical sets and 0 for disjoint', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });
});

describe('overlap', () => {
  it('flags two skills with near-identical descriptions', () => {
    function s(id: string, d: string) {
      return { id, type: 'skill' as const, name: id, description: d, lines: 1, pack: null, source: 's' };
    }
    const model = {
      version: 1 as const,
      nodes: [s('skill:x', 'Use when editing typescript types and code'), s('skill:y', 'Use when editing typescript types and code')],
      edges: [],
    };
    const f = overlap(model, { usedSkillNames: new Set() });
    expect(f).toHaveLength(1);
    expect(f[0]?.nodes).toEqual(expect.arrayContaining(['skill:x', 'skill:y']));
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/overlap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/analyze/overlap.ts`**

```ts
import type { GraphNode } from '../model/types.js';
import type { Detector, Finding } from './types.js';

const STOP = new Set(['use', 'when', 'the', 'and', 'for', 'with', 'a', 'an', 'to', 'of', 'in', 'on', 'or']);
const THRESHOLD = 0.3;

export function triggerTerms(description: string): Set<string> {
  const words = description.toLowerCase().match(/[a-z][a-z0-9-]+/g) ?? [];
  return new Set(words.filter((w) => w.length >= 3 && !STOP.has(w)));
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export const overlap: Detector = (model) => {
  const skills = model.nodes.filter((n): n is GraphNode => n.type === 'skill' && n.description !== '');
  const terms = new Map(skills.map((s) => [s.id, triggerTerms(s.description)]));
  const out: Finding[] = [];
  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const a = skills[i];
      const b = skills[j];
      if (!a || !b) continue;
      const score = jaccard(terms.get(a.id) ?? new Set(), terms.get(b.id) ?? new Set());
      if (score < THRESHOLD) continue;
      out.push({
        kind: 'overlap',
        severity: 'warning',
        nodes: [a.id, b.id],
        evidence: `description trigger-term overlap ${(score * 100).toFixed(0)}% (>= ${THRESHOLD * 100}% anti-bloat threshold)`,
        suggestion: 'clarify the boundary in each description, or fuse the skills (anti-bloat rule 3)',
      });
    }
  }
  return out;
};
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/overlap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/analyze/overlap.ts packages/harness-graph/src/analyze/overlap.test.ts
git commit -m "feat(harness-graph): lexical overlap detector (anti-bloat signal)

Why: surfaces the >30% responsibility-overlap rule as a visible warning;
honest about being lexical (a signal to weigh, never a blocking gate)."
```

---

### Task 12: Detector — routing cycles

**Files:**
- Create: `packages/harness-graph/src/analyze/routing-cycle.ts`
- Create: `packages/harness-graph/src/analyze/routing-cycle.test.ts`

**Interfaces:**
- Consumes: `Detector` (Task 8).
- Produces: `routingCycle: Detector` — DFS over the `routes-to` subgraph; each cycle → one `severity: 'warning'` finding listing the cycle's node ids.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { routingCycle } from './routing-cycle.js';

function s(id: string) {
  return { id, type: 'skill' as const, name: id, description: '', lines: 1, pack: null, source: 's' };
}
function r(from: string, to: string) {
  return { from, to, kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' };
}
const ctx = { usedSkillNames: new Set<string>() };

describe('routingCycle', () => {
  it('detects a 2-node cycle', () => {
    const model = { version: 1 as const, nodes: [s('skill:a'), s('skill:b')], edges: [r('skill:a', 'skill:b'), r('skill:b', 'skill:a')] };
    expect(routingCycle(model, ctx)).toHaveLength(1);
  });
  it('passes an acyclic chain', () => {
    const model = { version: 1 as const, nodes: [s('skill:a'), s('skill:b'), s('skill:c')], edges: [r('skill:a', 'skill:b'), r('skill:b', 'skill:c')] };
    expect(routingCycle(model, ctx)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/routing-cycle.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/analyze/routing-cycle.ts`**

```ts
import type { Detector, Finding } from './types.js';

export const routingCycle: Detector = (model) => {
  const adj = new Map<string, string[]>();
  for (const e of model.edges) {
    if (e.kind !== 'routes-to') continue;
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from) ?? []).push(e.to);
  }
  const out: Finding[] = [];
  const color = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 in-stack, 2 done
  const stack: string[] = [];

  const visit = (node: string): void => {
    color.set(node, 1);
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      const cn = color.get(next) ?? 0;
      if (cn === 1) {
        const start = stack.indexOf(next);
        const cycle = stack.slice(start);
        out.push({
          kind: 'routing-cycle',
          severity: 'warning',
          nodes: cycle,
          evidence: `routes-to cycle: ${[...cycle, next].join(' -> ')}`,
          suggestion: 'a routing loop usually means a hand-off was declared in the wrong direction',
        });
      } else if (cn === 0) {
        visit(next);
      }
    }
    stack.pop();
    color.set(node, 2);
  };

  for (const n of model.nodes) if ((color.get(n.id) ?? 0) === 0) visit(n.id);
  return out;
};
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/routing-cycle.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/src/analyze/routing-cycle.ts packages/harness-graph/src/analyze/routing-cycle.test.ts
git commit -m "feat(harness-graph): detect routes-to cycles

Why: a routing loop is a doctrine smell (a hand-off declared backwards);
cheap to find with a DFS over the routes-to subgraph."
```

---

### Task 13: Detector registry + `analyze()` aggregate

**Files:**
- Create: `packages/harness-graph/src/analyze/index.ts`
- Create: `packages/harness-graph/src/analyze/index.test.ts`
- Modify: `packages/harness-graph/src/index.ts`

**Interfaces:**
- Consumes: every detector (Tasks 9-12).
- Produces: `DETECTORS: readonly Detector[]`, `analyze(model, ctx): Finding[]` (run all, concat, sorted by severity then kind), `blockingFindings(findings): Finding[]` (severity error).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { analyze, blockingFindings } from './index.js';

const ctx = { usedSkillNames: new Set<string>() };

describe('analyze', () => {
  it('aggregates a broken route as a blocking finding', () => {
    const model = {
      version: 1 as const,
      nodes: [{ id: 'skill:a', type: 'skill' as const, name: 'a', description: '', lines: 1, pack: null, source: 's' }],
      edges: [{ from: 'skill:a', to: 'skill:ghost', kind: 'routes-to' as const, origin: 'declared' as const, evidence: 'e' }],
    };
    const findings = analyze(model, ctx);
    expect(blockingFindings(findings).length).toBeGreaterThanOrEqual(1);
    expect(blockingFindings(findings)[0]?.kind).toBe('broken-route');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness-graph test src/analyze/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/analyze/index.ts`**

```ts
import type { GraphModel } from '../model/types.js';
import { brokenRoutes } from './broken-routes.js';
import { orphans } from './orphans.js';
import { overlap } from './overlap.js';
import { routingCycle } from './routing-cycle.js';
import { type AnalyzeCtx, type Detector, type Finding, isError } from './types.js';

export const DETECTORS: readonly Detector[] = [brokenRoutes, orphans, overlap, routingCycle];

const RANK: Record<Finding['severity'], number> = { error: 0, warning: 1, info: 2 };

export function analyze(model: GraphModel, ctx: AnalyzeCtx): Finding[] {
  return DETECTORS.flatMap((d) => d(model, ctx)).sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || a.kind.localeCompare(b.kind),
  );
}

export function blockingFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter(isError);
}

export * from './types.js';
```

- [ ] **Step 4: Re-export from `src/index.ts`** (append)

```ts
export { analyze, blockingFindings, DETECTORS } from './analyze/index.js';
export type { Finding, Severity, AnalyzeCtx, Detector } from './analyze/types.js';
```

- [ ] **Step 5: Run + typecheck**

Run: `pnpm --filter @voidcorp/harness-graph test && pnpm --filter @voidcorp/harness-graph typecheck`
Expected: pass + clean.

- [ ] **Step 6: Commit**

```bash
git add packages/harness-graph/src/analyze/index.ts packages/harness-graph/src/analyze/index.test.ts packages/harness-graph/src/index.ts
git commit -m "feat(harness-graph): detector registry + analyze aggregate

Why: one entry point the CLI/CI call; error-severity findings are what
the gate blocks on, everything else is advisory."
```

---

### Task 14: CLI `graph` command — build / check / audit

**Files:**
- Create: `packages/cli/src/commands/graph.ts`
- Create: `packages/cli/src/lib/graph-io.ts`
- Create: `packages/cli/src/lib/graph-io.test.ts`
- Modify: `packages/cli/src/main.ts` (dispatch)
- Modify: `packages/cli/src/commands/help.ts` (list the command)
- Modify: `packages/cli/package.json` (add `@voidcorp/harness-graph` dependency)

**Interfaces:**
- Consumes: `scanSourceTree`, `assembleModel`, `serializeModel`, `analyze`, `blockingFindings` (kernel); `parseUsageLog` (existing `lib/audit.js`); `findCoreSource` (`lib/paths.js`); `render` helpers.
- Produces: `graph(args): Promise<void>`; pure helper `usedSkillNames(usage): Set<string>` in `graph-io.ts`.

- [ ] **Step 1: Add the kernel dependency**

In `packages/cli/package.json` `dependencies`, add:

```json
    "@voidcorp/harness-graph": "workspace:*"
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test for the pure helper `src/lib/graph-io.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { usedSkillNames } from './graph-io.js';

describe('usedSkillNames', () => {
  it('strips the plugin prefix and dedupes', () => {
    const set = usedSkillNames([
      { timestamp: '2026-06-01T00:00:00Z', skill: 'harness:tdd' },
      { timestamp: '2026-06-02T00:00:00Z', skill: 'tdd' },
      { timestamp: '2026-06-03T00:00:00Z', skill: 'superpowers:brainstorming' },
    ]);
    expect(set.has('tdd')).toBe(true);
    expect(set.has('brainstorming')).toBe(true);
    expect(set.size).toBe(2);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter @voidcorp/harness test src/lib/graph-io.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement `src/lib/graph-io.ts`**

```ts
import type { UsageEntry } from './audit.js';

/** Bare skill names that have fired (drop the `<plugin>:` prefix, dedupe). */
export function usedSkillNames(usage: readonly UsageEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of usage) {
    const colon = e.skill.lastIndexOf(':');
    out.add(colon >= 0 ? e.skill.slice(colon + 1) : e.skill);
  }
  return out;
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm --filter @voidcorp/harness test src/lib/graph-io.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement `src/commands/graph.ts`**

```ts
// `void-harness graph` — build the model, gate on it (check), or report (audit).
// Thin shell over @voidcorp/harness-graph (functional core / imperative shell),
// mirroring the existing `audit` command.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  analyze,
  assembleModel,
  blockingFindings,
  scanSourceTree,
  serializeModel,
} from '@voidcorp/harness-graph';
import { parseUsageLog } from '../lib/audit.js';
import { findCoreSource } from '../lib/paths.js';
import { banner, blank, c, footer, glyph, line } from '../lib/render.js';
import { usedSkillNames } from '../lib/graph-io.js';

function packsDirFor(coreSource: string): string {
  return join(dirname(coreSource), 'packs');
}
function modelPath(coreSource: string): string {
  return join(dirname(coreSource), 'harness-graph', 'model.json');
}
function relationsPath(coreSource: string): string {
  return join(dirname(coreSource), 'harness-graph', 'relations.graph.yaml');
}

async function loadModel(coreSource: string) {
  const tree = scanSourceTree(coreSource, packsDirFor(coreSource));
  const rp = relationsPath(coreSource);
  const declared = existsSync(rp) ? readFileSync(rp, 'utf8') : '';
  return assembleModel(tree, declared);
}

function ctxFor(): { usedSkillNames: Set<string> } {
  const logPath = join(process.cwd(), '.void', 'usage.log');
  const usage = existsSync(logPath) ? parseUsageLog(readFileSync(logPath, 'utf8')) : [];
  return { usedSkillNames: usedSkillNames(usage) };
}

export async function graph(args: readonly string[]): Promise<void> {
  const sub = args[0] ?? 'build';
  const coreSource = await findCoreSource();

  if (sub === 'build') {
    const model = await loadModel(coreSource);
    writeFileSync(modelPath(coreSource), serializeModel(model));
    banner('graph build');
    blank();
    line(`  ${c.green(`${model.nodes.length} nodes`)} ${c.dim(glyph.dot)} ${c.green(`${model.edges.length} edges`)} -> ${c.dim('harness-graph/model.json')}`);
    footer(c.dim('model.json regenerated. Commit it; the check gate fails on drift.'));
    return;
  }

  if (sub === 'check') {
    const model = await loadModel(coreSource);
    const onDisk = existsSync(modelPath(coreSource)) ? readFileSync(modelPath(coreSource), 'utf8') : '';
    const drift = onDisk !== serializeModel(model);
    const blocking = blockingFindings(analyze(model, ctxFor()));
    banner('graph check');
    blank();
    if (drift) line(`  ${c.red('model.json is stale')} — run \`void-harness graph build\` and commit.`);
    for (const f of blocking) line(`  ${c.red('error')} ${f.kind}: ${f.evidence}`);
    if (drift || blocking.length > 0) {
      footer(c.red('graph check failed.'));
      process.exit(1);
    }
    footer(c.green('graph check passed.'));
    return;
  }

  if (sub === 'audit') {
    const model = await loadModel(coreSource);
    const findings = analyze(model, ctxFor());
    banner('graph audit');
    blank();
    line(`  ${c.dim('nodes')} ${model.nodes.length} ${c.dim(glyph.dot)} ${c.dim('edges')} ${model.edges.length} ${c.dim(glyph.dot)} ${c.dim('findings')} ${findings.length}`);
    for (const f of findings) {
      const sev = f.severity === 'error' ? c.red(f.severity) : f.severity === 'warning' ? c.yellow(f.severity) : c.dim(f.severity);
      blank();
      line(`  ${sev} ${c.bold(f.kind)} ${c.dim(f.nodes.join(', '))}`);
      line(`    ${f.evidence}`);
      line(`    ${c.dim(`-> ${f.suggestion}`)}`);
    }
    blank();
    footer(c.dim('warnings/info are signals to weigh (HITL); only broken-route blocks CI.'));
    return;
  }

  console.error(`unknown graph subcommand: ${sub}\n`);
  process.exit(2);
}
```

- [ ] **Step 7: Wire dispatch in `src/main.ts`**

Add the import near the others:
```ts
import { graph } from './commands/graph.js';
```
Add a case before `audit`:
```ts
    case 'graph':
      await graph(rest);
      return;
```

- [ ] **Step 8: List it in `src/commands/help.ts`**

Add a help line consistent with the existing format (read the file first; match its style), e.g. under the command list:
```
  graph [build|check|audit]   build/gate/report the skill-agent graph
```

- [ ] **Step 9: Run the full CLI test suite + typecheck + build**

Run: `pnpm --filter @voidcorp/harness test && pnpm --filter @voidcorp/harness typecheck && pnpm --filter @voidcorp/harness build`
Expected: all green (graph-io test passes; no regressions).

- [ ] **Step 10: Manual smoke against the real repo**

Run: `pnpm --filter @voidcorp/harness-graph build && node packages/cli/bin/void-harness.mjs graph build`
Expected: prints node/edge counts and writes `packages/harness-graph/model.json`.

- [ ] **Step 11: Commit**

```bash
git add packages/cli/src/commands/graph.ts packages/cli/src/lib/graph-io.ts packages/cli/src/lib/graph-io.test.ts packages/cli/src/main.ts packages/cli/src/commands/help.ts packages/cli/package.json pnpm-lock.yaml
git commit -m "feat(cli): void-harness graph build|check|audit

Why: a thin shell over the kernel gives the maintainer the model file and
the diagnostic report, and gives CI the drift+broken-route gate."
```

---

### Task 15: Seed `relations.graph.yaml` and commit the first `model.json`

**Files:**
- Create: `packages/harness-graph/relations.graph.yaml`
- Create: `packages/harness-graph/model.json` (generated)
- Create: `packages/harness-graph/README.md`

**Interfaces:** none (data + docs task).

- [ ] **Step 1: Generate a candidate model with only derived edges**

Run: `node packages/cli/bin/void-harness.mjs graph build`
Then open `packages/harness-graph/model.json` and review the derived edges + the node list.

- [ ] **Step 2: Seed declared semantic edges (one-time extraction, then curate)**

Read each `packages/core/skills/*/SKILL.md` body for explicit cross-references — phrases like "transition to", "composes with", "routes to", "see also", "compose gstack". For each real one, add an entry to `relations.graph.yaml`:

```yaml
# Declared semantic edges (routing/composition/conflict) that cannot be derived
# mechanically. Every edge carries evidence: the prose line that justifies it.
# Regenerate model.json after editing: `void-harness graph build`.
edges:
  - from: skill:brainstorming
    to: skill:writing-plans
    kind: routes-to
    evidence: "brainstorming SKILL.md: HARD GATE transition to writing-plans"
  - from: skill:writing-plans
    to: skill:tdd
    kind: routes-to
    evidence: "writing-plans: each step declares a TDD mode"
  - from: skill:server-action
    to: skill:security-guidance
    kind: composes
    evidence: "harness-server:server-action: composes with security-guidance"
  # ...continue from the actual prose found; do NOT invent edges.
```

This extraction may be drafted with an LLM pass, but every committed edge must be human-verified against the cited prose. The extraction tool is NEVER in the build path — only this curated file is.

- [ ] **Step 3: Regenerate and review the model**

Run: `node packages/cli/bin/void-harness.mjs graph build`
Then: `node packages/cli/bin/void-harness.mjs graph audit`
Confirm: zero `broken-route` findings (fix node ids in the yaml until clean). Read the overlap/orphan warnings and sanity-check them.

- [ ] **Step 4: Write `packages/harness-graph/README.md`**

Document: what the package is, the node/edge model, how to regenerate (`void-harness graph build`), the rule that `relations.graph.yaml` is curated with evidence, and that `model.json` is generated + committed (CI fails on drift). Keep it under ~60 lines.

- [ ] **Step 5: Commit**

```bash
git add packages/harness-graph/relations.graph.yaml packages/harness-graph/model.json packages/harness-graph/README.md
git commit -m "feat(harness-graph): seed declared relations + first model.json

Why: the curated semantic edges + the committed model are the baseline the
CI drift gate compares against and the studio renders."
```

---

### Task 16: CI gate — `graph check`

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: root `package.json` (add a `graph:check` script)

**Interfaces:** none.

- [ ] **Step 1: Add a root script in `package.json`**

In root `package.json` `scripts`, add:
```json
    "graph:check": "pnpm --filter @voidcorp/harness-graph build && node packages/cli/bin/void-harness.mjs graph check"
```

- [ ] **Step 2: Add the CI step**

In `.github/workflows/ci.yml`, after the "Build packages" step and before or after "Skill tests", add:
```yaml
      - name: Graph integrity (model drift + broken routes)
        run: pnpm graph:check
```
(Read the surrounding steps first and match indentation/placement; the CLI bin must be runnable, so this comes after the build step that produces `packages/cli/dist`. If the bin runs from source via `bin/void-harness.mjs` without a build, place it after install.)

- [ ] **Step 3: Verify locally**

Run: `pnpm graph:check`
Expected: "graph check passed." and exit 0.

- [ ] **Step 4: Prove the gate bites (temporary)**

Temporarily add a bogus edge to `relations.graph.yaml` (`from: skill:nope`), run `pnpm graph:check`, confirm it exits non-zero with a `broken-route` error, then revert the bogus edge and re-run to confirm green.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: gate on graph model drift + broken routes

Why: keep the committed model.json honest and block dangling edges the
same way the core-assets mirror check blocks stale assets."
```

---

### Task 17: Telemetry seed — enrich activation logging (M6)

**Files:**
- Modify: `packages/core/hooks/skill-usage-meter.sh`
- Create: `packages/core/hooks/skill-usage-meter.test.ts` (shell-invoking test) OR add to existing hook test harness — check `test/` for the pattern first.
- Modify: `.gitignore` (ignore `.void/activations.jsonl`)
- Modify: `packages/core/modules/*` or the relevant doctrine file IF it documents the usage log (grep first)

**Interfaces:**
- Produces: an additional structured JSONL event per activation in `.void/activations.jsonl`, alongside the existing `usage.log` line. Event shape:
  `{ "ts", "kind", "name", "event", "trigger": { "tool", "ext": [] }, "sessionId" }`.

- [ ] **Step 1: Read the current hook and its test pattern**

Run: `cat packages/core/hooks/skill-usage-meter.sh` and `ls test/` and `grep -rl "skill-usage-meter\|usage.log" test/ packages/cli/test 2>/dev/null`.
Note how hooks receive their event JSON (stdin) and how existing hook tests invoke a `.sh` with a mocked stdin (e.g. the `block-dangerous-bash` test). Mirror that pattern.

- [ ] **Step 2: Write the failing shell test**

Following the existing hook-test pattern (a vitest test that pipes a mock hook payload into the script and asserts on the file it writes), assert:
- given a mock skill-activation payload on stdin, the hook appends ONE line to a temp `.void/activations.jsonl`;
- the line is valid JSON with keys `ts`, `kind: "skill"`, `name`, `event`;
- the hook exits 0 even when the log dir is read-only (best-effort, never breaks the session).

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('skill-usage-meter activations.jsonl', () => {
  it('appends one valid JSON event', () => {
    const dir = mkdtempSync(join(tmpdir(), 'void-meter-'));
    const payload = JSON.stringify({ skill_name: 'harness:tdd', hook_event_name: 'PreToolUse', tool_name: 'Skill' });
    execFileSync('bash', ['packages/core/hooks/skill-usage-meter.sh'], {
      input: payload,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
    const lines = readFileSync(join(dir, '.void', 'activations.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const ev = JSON.parse(lines[0] ?? '{}');
    expect(ev).toMatchObject({ kind: 'skill', name: 'harness:tdd', event: 'PreToolUse' });
    expect(typeof ev.ts).toBe('string');
  });
});
```
(Adjust the env var / payload keys to match what the existing hook actually reads — confirm in Step 1.)

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm vitest run packages/core/hooks/skill-usage-meter.test.ts`
Expected: FAIL — `activations.jsonl` not written.

- [ ] **Step 4: Enrich `skill-usage-meter.sh`**

Keep the existing `usage.log` append untouched (back-compat for the audit command). Add, best-effort, a JSONL event. Read the payload fields the harness provides (confirm names in Step 1; below assumes `jq` is available, which CLAUDE.md says CI has, with a guarded fallback):

```sh
# --- structured activation event (seeds the Phase 2 live/behavioral view) ---
# Best-effort, never blocks the session. Captures only names/extensions/event,
# NEVER file contents or secrets.
ACT_LOG="$LOG_DIR/activations.jsonl"
if command -v jq >/dev/null 2>&1; then
  printf '%s' "$PAYLOAD" | jq -c \
    --arg ts "$TS" --arg kind skill --arg name "$SKILL" \
    '{ts:$ts, kind:$kind, name:$name, event:(.hook_event_name // ""), trigger:{tool:(.tool_name // "")}, sessionId:(.session_id // "")}' \
    >>"$ACT_LOG" 2>/dev/null || true
else
  printf '{"ts":"%s","kind":"skill","name":"%s","event":"","trigger":{},"sessionId":""}\n' "$TS" "$SKILL" \
    >>"$ACT_LOG" 2>/dev/null || true
fi
```
(`PAYLOAD`, `TS`, `SKILL`, `LOG_DIR` must be the variables the script already defines; align names with the real script from Step 1. If the script does not currently capture stdin into a variable, add `PAYLOAD="$(cat)"` near the top and feed both the existing parse and this one from it.)

- [ ] **Step 5: Run to confirm pass**

Run: `pnpm vitest run packages/core/hooks/skill-usage-meter.test.ts`
Expected: PASS.

- [ ] **Step 6: Gitignore the activations log**

Add to `.gitignore`:
```
.void/activations.jsonl
```

- [ ] **Step 7: Regenerate the core-assets mirror (hook lives under packages/core)**

Run: `pnpm --filter @voidcorp/harness build:assets`
Confirm: `git status packages/cli/core-assets` shows the updated hook; stage it.

- [ ] **Step 8: Run anti-bloat (hooks <= 100 LOC) + full suite**

Run: `pnpm anti-bloat:check && pnpm vitest run`
Expected: hook still under 100 LOC; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/core/hooks/skill-usage-meter.sh packages/core/hooks/skill-usage-meter.test.ts packages/cli/core-assets .gitignore
git commit -m "feat(harness): seed enriched activation telemetry (jsonl)

Why: the Phase 2 should-have-fired analysis needs per-activation context
(event + tool + extensions); start recording now, analyze later. Local,
gitignored, best-effort so it never breaks a session."
```

---

## Self-Review

**Spec coverage** (against `docs/specs/2026-06-26-harness-graph-viz.md`):
- Section 3 architecture (kernel package, dependency direction) -> Tasks 1-7, 14.
- Section 4 model (node/edge types, ids) -> Tasks 2, 4, 5, 7.
- Section 5 hybrid sourcing + CI gate -> Tasks 5 (derived), 6 (declared), 9 (broken-route), 14/16 (check gate), 15 (seed). NOTE: the prose<->declaration consistency check (spec 5.3.a) is implemented as a follow-up detector — flagged below.
- Section 6 analyses -> Tasks 9-13 (broken-routes, orphans, overlap, routing-cycle). NOTE: coverage-gap and missing-expected-pair detectors are deferred to a follow-up task — flagged below.
- Section 8 telemetry seed -> Task 17.
- Section 9 data flow (build/check/audit) -> Task 14.
- Section 7 (3D studio) -> NOT in this plan by design (Plan B).
- Section 10 errors -> covered by detector tests + best-effort hook (Task 17).
- Section 11 tests -> every kernel task is TDD; Task 17 is a shell test.

**Identified gaps (add as Task 18 + Task 19 when executing, kept explicit rather than hidden):**
- **Task 18 (coverage-gap + pack-shadow detectors):** a `coverage-gap` detector over a small curated `situations` data file (situation -> keyword match against skill descriptions; zero matches = info finding) and a `pack-shadow` detector (a pack skill overlapping a core skill name with no `extends` edge = warning). Same Detector signature, registered in Task 13's `DETECTORS`. Deferred because they need a curated `situations.ts`; not load-bearing for the first usable model.
- **Task 19 (prose<->declaration consistency detector):** scan each SKILL.md body for `routes to`/`composes with` mentions and assert a matching declared edge exists (and vice versa), emitting `error` so it joins the CI gate. Deferred because it needs the seeded `relations.graph.yaml` (Task 15) to exist first to avoid a flood of initial errors.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; the two deferred detectors are explicitly scoped above, not hidden as "handle the rest".

**Type consistency:** `GraphNode`/`GraphEdge`/`GraphModel` (Task 2) used verbatim in Tasks 4-14; `Detector`/`Finding`/`AnalyzeCtx` (Task 8) used verbatim in Tasks 9-14; `usedSkillNames` (Task 14) matches its consumer in `graph.ts`; `scanSourceTree`/`assembleModel`/`serializeModel`/`analyze`/`blockingFindings` exported from the kernel index (Tasks 7, 13) and imported in `graph.ts` (Task 14).
