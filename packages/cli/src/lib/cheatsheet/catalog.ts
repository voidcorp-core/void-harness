import { parseCatalogV1 } from '@voidcorp/harness-graph';
import { z } from 'zod';
import type { SpecialistContract } from '../specialists/schema.js';

export type Runtime = 'claude' | 'codex' | 'cli';
export interface Invocation { readonly runtime: Runtime; readonly text: string }
export interface CatalogEntry {
  readonly id: string;
  readonly type: 'skill' | 'hook' | 'agent' | 'specialist' | 'command';
  readonly name: string;
  readonly description: string;
  readonly pack: string;
  readonly runtimes: readonly Runtime[];
  readonly invocations: readonly Invocation[];
  readonly triggers: readonly string[];
  readonly relatedIds: readonly string[];
}
export interface HookWiring {
  readonly name: string;
  readonly runtime: 'claude' | 'codex';
  readonly trigger: string;
}

// Zod 4.4.3: https://github.com/colinhacks/zod/blob/v4.4.3/packages/docs/content/api.mdx
const slug = z.string().max(100).regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/);
const runtimes = z.array(z.enum(['claude', 'codex'])).max(2);
const triggerSchema = z.object({
  globs: z.array(z.string().max(500)).max(100).optional(),
  extensions: z.array(z.string().max(100)).max(100).optional(),
  tools: z.array(z.string().max(100)).max(100).optional(),
});
export const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

/** Catalogue data only; no consumer paths, runtime probes or renderer inventory. */
export function projectCatalog(
  input: unknown,
  specialists: readonly SpecialistContract[],
  wiring: readonly HookWiring[],
  commands: readonly CatalogEntry[] = [],
): readonly CatalogEntry[] {
  const graph = parseCatalogV1(input);
  if (graph.nodes.length > 2048) throw new Error('CATALOG_LIMIT');
  const entries: CatalogEntry[] = [...commands];
  for (const node of graph.nodes) {
    if (node.type !== 'skill' && node.type !== 'agent' && node.type !== 'hook') continue;
    const name = slug.parse(node.name);
    const pack = slug.parse(node.pack ?? 'core');
    const declared = triggerSchema.parse(node.triggers ?? {});
    const hooks = wiring.filter(item => item.name === name);
    const supported = node.type === 'hook'
      ? [...new Set(hooks.map(item => item.runtime))]
      : runtimes.parse(node.runtimes ?? (node.type === 'agent' ? ['claude', 'codex'] : []));
    const invocations: Invocation[] = node.type === 'skill'
      ? supported.map(runtime => ({ runtime, text: runtime === 'codex' ? `$${name}` : `/${name}` }))
      : node.type === 'agent'
        ? supported.map(runtime => ({ runtime, text: `Ask the agent to delegate to ${name}.` }))
        : [];
    const triggers = [
      ...hooks.map(item => `${item.runtime}: ${item.trigger}`),
      ...Object.entries(declared).flatMap(([kind, values]) => (values ?? []).map(value => `${kind}: ${value}`)),
    ];
    const role = specialists.find(specialist => specialist.name === name);
    entries.push({
      id: node.id, type: node.type, name, description: node.description,
      pack, runtimes: supported, invocations,
      triggers: triggers.length > 0 ? triggers.sort(compare) : ['Trigger not declared.'],
      relatedIds: role === undefined ? [] : [role.id],
    });
  }
  for (const specialist of specialists) {
    const agent = entries.find(entry => entry.type === 'agent' && entry.name === specialist.name);
    if (agent === undefined) throw new Error('SPECIALIST_AGENT_MISSING');
    entries.push({
      id: specialist.id, type: 'specialist', name: specialist.name,
      description: specialist.description, pack: 'core', runtimes: agent.runtimes,
      invocations: agent.invocations, relatedIds: [agent.id],
      triggers: [`Stages: ${specialist.stages.join(', ')}`, `When any: ${specialist.appliesWhen.any.join(', ')}`],
    });
  }
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('DUPLICATE_ID');
  return entries.sort((left, right) => compare(left.id, right.id));
}
