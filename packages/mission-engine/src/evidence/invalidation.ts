import { verifyEvidenceIntegrity } from './schema.js';
import type {
  Evidence,
  EvidenceAssessment,
  EvidenceContext,
} from './types.js';

export function assessEvidence(
  evidence: Evidence,
  context: EvidenceContext,
): EvidenceAssessment {
  if (!verifyEvidenceIntegrity(evidence)) {
    return { status: 'tampered', staleDependencies: [] };
  }
  const staleDependencies = evidence.dependencies
    .filter((dependency) => {
      const current = context.dependencies[dependency.key];
      return current !== undefined && current !== dependency.hash;
    })
    .map((dependency) => dependency.key)
    .sort();
  return {
    status: staleDependencies.length === 0 ? 'fresh' : 'stale',
    staleDependencies,
  };
}
