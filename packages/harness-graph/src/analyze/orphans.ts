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
      evidence: `${n.id} has no relations${n.type === 'skill' ? ' and has never fired in local mission events' : ''}`,
      suggestion: 'wire it into routing/composition, or consider deprecating it (audit is HITL)',
    });
  }
  return out;
};
