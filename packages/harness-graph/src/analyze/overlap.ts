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
