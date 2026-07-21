import type { Detector, Finding } from './types.js';

/**
 * Governance, fail-closed: every capability (skill) must declare an accountable `owner:` in its
 * frontmatter. An ownerless skill is a blocking `error` — no capacity without a proof of ownership
 * (spec §2). Scoped to skills; hooks/commands/packs/agents are not capabilities.
 */
export const missingOwner: Detector = (model) => {
  const out: Finding[] = [];
  for (const n of model.nodes) {
    if (n.type !== 'skill') continue;
    if (n.owner && n.owner.trim() !== '') continue;
    out.push({
      kind: 'missing-owner',
      severity: 'error',
      nodes: [n.id],
      evidence: `${n.id} declares no owner`,
      suggestion: 'add `owner: <maintainer>` to its SKILL.md frontmatter',
    });
  }
  return out;
};
