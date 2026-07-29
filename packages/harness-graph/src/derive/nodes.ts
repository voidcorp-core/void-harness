import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { type GraphNode, type NodeTriggers, type NodeType, nodeId } from '../model/types.js';
import { parseHookMatchers } from './hook-matchers.js';
import { countLines, estimateTokens, readFrontmatter } from './read-frontmatter.js';

export interface SourceEntry {
  readonly name: string;
  readonly pack?: string | null; // allow-null: library boundary (pack absent for core nodes)
  readonly source: string;
  readonly text: string;
  /** Pre-derived triggers (hooks get theirs from the plugin manifest, not frontmatter). */
  readonly triggers?: NodeTriggers;
}
export interface SourceTree {
  readonly skills: readonly SourceEntry[];
  readonly agents: readonly SourceEntry[];
  readonly hooks: readonly SourceEntry[];
  readonly commands: readonly SourceEntry[];
  readonly packs: readonly SourceEntry[];
  readonly profiles: readonly SourceEntry[];
  readonly workflowDefs: readonly SourceEntry[];
}

const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 10_000;

function within(boundary: string, target: string): boolean {
  const path = relative(boundary, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function sourceNames(boundary: string, directory: string): readonly string[] {
  if (!existsSync(directory)) return [];
  const canonicalBoundary = realpathSync(boundary);
  const metadata = lstatSync(directory);
  if (metadata.isSymbolicLink()) {
    throw new Error(`GRAPH_SOURCE_PATH_ESCAPE: directory is a symlink: ${directory}`);
  }
  const canonicalDirectory = realpathSync(directory);
  if (!metadata.isDirectory() || !within(canonicalBoundary, canonicalDirectory)) {
    throw new Error(`GRAPH_SOURCE_PATH_ESCAPE: directory leaves its declared root: ${directory}`);
  }
  const names = readdirSync(canonicalDirectory).sort(cmp);
  if (names.length > MAX_DIRECTORY_ENTRIES) {
    throw new Error(`GRAPH_SOURCE_LIMIT: ${directory} exceeds ${MAX_DIRECTORY_ENTRIES} entries`);
  }
  return names;
}

function sourceText(boundary: string, path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink()) {
    throw new Error(`GRAPH_SOURCE_PATH_ESCAPE: source is a symlink: ${path}`);
  }
  const canonicalBoundary = realpathSync(boundary);
  const canonicalPath = realpathSync(path);
  if (!metadata.isFile() || !within(canonicalBoundary, canonicalPath)) {
    throw new Error(`GRAPH_SOURCE_PATH_ESCAPE: source leaves its declared root: ${path}`);
  }
  if (metadata.size > MAX_SOURCE_BYTES) {
    throw new Error(`GRAPH_SOURCE_LIMIT: ${path} exceeds ${MAX_SOURCE_BYTES} bytes`);
  }
  return readFileSync(canonicalPath, 'utf8');
}

function toNode(type: NodeType, e: SourceEntry): GraphNode {
  const pack = e.pack ?? null; // allow-null: GraphNode.pack is string | null per model contract
  const { description, triggers: fmTriggers, activation, owner, runtimes, enforcement, evalTargets, successSignal } =
    readFrontmatter(e.text);
  // Pre-derived triggers (hooks, from the plugin manifest) win over frontmatter.
  const triggers = e.triggers ?? fmTriggers;
  const base: GraphNode = {
    id: nodeId(type, e.name, pack),
    type,
    name: e.name,
    description,
    lines: countLines(e.text),
    staticTokens: estimateTokens(e.text),
    pack,
    source: e.source,
  };
  return {
    ...base,
    ...(triggers ? { triggers } : {}),
    ...(activation ? { activation } : {}),
    ...(owner ? { owner } : {}),
    ...(runtimes ? { runtimes } : {}),
    ...(enforcement ? { enforcement } : {}),
    ...(evalTargets ? { evalTargets } : {}),
    ...(successSignal ? { successSignal } : {}),
  };
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
    // `_`-prefixed files are sourced hook LIBRARIES, not hooks: CLAUDE.md rule 5
    // exempts them from the per-hook cap precisely because they are shared logic
    // rather than an enforcement point. Counting them inflates the floor and
    // makes the model contradict the doctrine it is supposed to map.
    ...tree.hooks.filter((e) => !e.name.startsWith('_')).map((e) => toNode('hook', e)),
    ...tree.commands.map((e) => toNode('command', e)),
    ...tree.packs.map((e) => toNode('pack', e)),
    ...tree.profiles.map((e) => toNode('profile', e)),
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
    for (const name of sourceNames(coreDir, skillsDir)) {
      const f = join(skillsDir, name, 'SKILL.md');
      const text = sourceText(coreDir, f);
      if (text !== undefined) skills.push({ name, pack: null, source: rel(f), text }); // allow-null: core skills have no pack
    }
  }
  const agents = readMdDir(coreDir, join(coreDir, 'agents'), rel);
  // Hooks get their triggers (tools) from the plugin manifest matchers, not from
  // frontmatter (.sh files have none). Path/glob scoping is not recoverable here.
  const pluginPath = join(coreDir, '.claude-plugin', 'plugin.json');
  const pluginText = sourceText(coreDir, pluginPath);
  const hookMatchers = pluginText === undefined ? new Map<string, NodeTriggers>() : parseHookMatchers(pluginText);
  const hooks = readDir(coreDir, join(coreDir, 'hooks'), '.sh', rel).map((e) => {
    const triggers = hookMatchers.get(e.name);
    return triggers ? { ...e, triggers } : e;
  });
  const commands = readMdDir(coreDir, join(coreDir, 'commands'), rel);
  const profiles = readDir(coreDir, join(coreDir, 'profiles'), '.yaml', rel);
  const packs: SourceEntry[] = [];
  const workflowDefs: SourceEntry[] = [];
  if (existsSync(packsDir)) {
    for (const pack of sourceNames(packsDir, packsDir)) {
      packs.push({ name: pack, pack: null, source: rel(join(packsDir, pack)), text: '' }); // allow-null: pack nodes are not scoped to a pack themselves
      const packSkillsDir = join(packsDir, pack, 'skills');
      if (existsSync(packSkillsDir)) {
        for (const name of sourceNames(packsDir, packSkillsDir)) {
          const f = join(packSkillsDir, name, 'SKILL.md');
          const text = sourceText(packsDir, f);
          if (text !== undefined) skills.push({ name, pack, source: rel(f), text });
        }
      }
    }
  }
  // workflow defs live next to skills as *.workflow.js
  if (existsSync(skillsDir)) {
    for (const name of sourceNames(coreDir, skillsDir)) {
      const wfDir = join(skillsDir, name, 'workflows');
      if (!existsSync(wfDir)) continue;
      for (const f of sourceNames(coreDir, wfDir)) {
        if (f.endsWith('.workflow.js')) {
          const path = join(wfDir, f);
          if (sourceText(coreDir, path) !== undefined) {
            workflowDefs.push({ name: f.replace(/\.workflow\.js$/, ''), source: rel(path), text: '' });
          }
        }
      }
    }
  }
  return { skills, agents, hooks, commands, packs, profiles, workflowDefs };
}

function readMdDir(boundary: string, dir: string, rel: (abs: string) => string): SourceEntry[] {
  return readDir(boundary, dir, '.md', rel);
}
function readDir(boundary: string, dir: string, ext: string, rel: (abs: string) => string): SourceEntry[] {
  if (!existsSync(dir)) return [];
  return sourceNames(boundary, dir)
    .filter((f) => f.endsWith(ext))
    .flatMap((f) => {
      const full = join(dir, f);
      const text = sourceText(boundary, full);
      return text === undefined
        ? []
        : [{ name: f.slice(0, -ext.length), source: rel(full), text }];
    });
}
