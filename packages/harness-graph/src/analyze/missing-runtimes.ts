import type { Detector, Finding } from './types.js';

/**
 * Governance, fail-closed: every capability (skill) must declare at least one supported runtime in
 * its `runtimes:` frontmatter. A skill with no declared runtimes is a blocking `error` — the runtime
 * matrix (spec §4) cannot place an undeclared capability. Scoped to skills, like `missing-owner`.
 */
export const missingRuntimes: Detector = (model) => {
  const out: Finding[] = [];
  for (const n of model.nodes) {
    if (n.type !== 'skill') continue;
    if (n.runtimes && n.runtimes.length > 0) continue;
    out.push({
      kind: 'missing-runtimes',
      severity: 'error',
      nodes: [n.id],
      evidence: `${n.id} declares no runtimes`,
      suggestion: 'add `runtimes: [claude, codex]` to its SKILL.md frontmatter',
    });
  }
  return out;
};
