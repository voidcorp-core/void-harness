import { type GraphEdge, type GraphNode, nodeId } from '../model/types.js';
import { cmp, type SourceTree } from './nodes.js';

export function deriveEdges(tree: SourceTree, nodes: readonly GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const coreSkillNames = new Set(tree.skills.filter((s) => !s.pack).map((s) => s.name));
  const skillIds = new Set(nodes.filter((n) => n.type === 'skill').map((n) => n.id));

  // companion-of: hook named after / prefixed by a core skill
  for (const hook of tree.hooks) {
    for (const skill of coreSkillNames) {
      if (hook.name === skill || hook.name.startsWith(`${skill}-`)) {
        edges.push({
          from: nodeId('hook', hook.name, null), // allow-null: core hooks have no pack
          to: nodeId('skill', skill, null), // allow-null: core skills have no pack
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
          from: nodeId('agent', agent.name, null), // allow-null: agents are not pack-scoped
          to: nodeId('skill', skill, null), // allow-null: core skills have no pack
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
      const to = nodeId('skill', s.name, null); // allow-null: core skills have no pack
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
  return cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.kind, b.kind);
}
