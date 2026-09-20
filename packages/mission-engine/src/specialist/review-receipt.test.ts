import { describe, expect, it } from 'vitest';
import { parseSpecialistCompletionValue } from './completion.js';

const SHA = `sha256:${'a'.repeat(64)}`;
const review = {
  taskId: 'mis_receipt_12345678', reviewerId: 'reviewer:independent', writerId: 'writer:primary',
  baseCommit: 'a'.repeat(40), reviewedCommit: 'b'.repeat(40), acceptanceCriteriaHash: SHA,
  readOnly: true, scope: { kind: 'general' }, proofIds: ['proof:authorization'], resolutions: [],
  provenance: { kind: 'review-artifact', path: 'reviews/independent.json', sha256: SHA,
    limitation: 'Runtime returned an identity rejected by its adapter; reviewer artifact is preserved.' },
};
const completion = {
  schemaVersion: 1, specialistId: 'core:independent-code-reviewer', contractVersion: 1,
  completionId: 'cmp_receipt_12345678', verdict: 'pass', findings: [], evidenceRequests: [], limitations: [], review,
};
describe('independent review receipt', () => {
  it('accepts traceable artifact provenance without inventing a native context identity', () => {
    expect(parseSpecialistCompletionValue(completion)).toMatchObject({ review });
  });
  it('refuses self-review, mutable subjects, and unbounded provenance', () => {
    for (const replacement of [
      { reviewerId: 'writer:primary' }, { reviewedCommit: 'working-tree' },
      { provenance: { ...review.provenance, path: '../outside.json' } },
      { provenance: { ...review.provenance, limitation: '' } }, { readOnly: false },
    ]) expect(parseSpecialistCompletionValue({ ...completion, review: { ...review, ...replacement } })).toBeUndefined();
  });
  it('requires a consequence and resolution condition for a blocking finding', () => {
    const finding = { id: 'authorization', severity: 'high', summary: 'Unauthorized tenant read',
      evidence: [{ path: 'src/auth.ts', line: 8, detail: 'Input controls tenant scope.' }],
      recommendation: 'Authenticate the principal.', classification: 'blocking',
      criterion: 'Tenant isolation', consequence: 'Other tenant data is exposed',
      resolutionCondition: 'Regression test rejects cross-tenant reads', basis: 'initial-scope-defect' };
    expect(parseSpecialistCompletionValue({ ...completion, verdict: 'changes-requested', findings: [finding] }))
      .toBeDefined();
    expect(parseSpecialistCompletionValue({ ...completion, verdict: 'changes-requested',
      findings: [{ ...finding, consequence: '' }] })).toBeUndefined();
  });
});
