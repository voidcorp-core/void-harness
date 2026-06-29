import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { type GraphNode, type NodeType, nodeId } from '../model/types.js';
import { countLines, readFrontmatter } from './read-frontmatter.js';

export interface SourceEntry {
  readonly name: string;
  readonly pack?: string | null; // allow-null: library boundary (pack absent for core nodes)
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
  const pack = e.pack ?? null; // allow-null: GraphNode.pack is string | null per model contract
  const { description, triggers } = readFrontmatter(e.text);
  const base: GraphNode = {
    id: nodeId(type, e.name, pack),
    type,
    name: e.name,
    description,
    lines: countLines(e.text),
    pack,
    source: e.source,
  };
  return triggers ? { ...base, triggers } : base;
}

/** Locale-independent code-unit comparison for deterministic, ICU-stable sorts. */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
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
  ].sort((a, b) => cmp(a.id, b.id));
}

/** Filesystem adapter: read the real repo into a SourceTree. */
export function scanSourceTree(coreDir: string, packsDir: string): SourceTree {
  // Repo root is the parent of packages/ — coreDir is <repo>/packages/core.
  const repoRoot = resolve(coreDir, '..', '..');
  // Produce a repo-relative, forward-slash path stable across any clone dir name.
  const rel = (abs: string): string => relative(repoRoot, abs).replace(/\\/g, '/');

  const skills: SourceEntry[] = [];
  const skillsDir = join(coreDir, 'skills');
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      const f = join(skillsDir, name, 'SKILL.md');
      if (existsSync(f)) skills.push({ name, pack: null, source: rel(f), text: readFileSync(f, 'utf8') }); // allow-null: core skills have no pack
    }
  }
  const agents = readMdDir(join(coreDir, 'agents'), rel);
  const hooks = readDir(join(coreDir, 'hooks'), '.sh', rel);
  const commands = readMdDir(join(coreDir, 'commands'), rel);
  const packs: SourceEntry[] = [];
  const workflowDefs: SourceEntry[] = [];
  if (existsSync(packsDir)) {
    for (const pack of readdirSync(packsDir)) {
      packs.push({ name: pack, pack: null, source: rel(join(packsDir, pack)), text: '' }); // allow-null: pack nodes are not scoped to a pack themselves
      const packSkillsDir = join(packsDir, pack, 'skills');
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

function readMdDir(dir: string, rel: (abs: string) => string): SourceEntry[] {
  return readDir(dir, '.md', rel);
}
function readDir(dir: string, ext: string, rel: (abs: string) => string): SourceEntry[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => {
      const full = join(dir, f);
      return { name: f.slice(0, -ext.length), source: rel(full), text: readFileSync(full, 'utf8') };
    });
}
