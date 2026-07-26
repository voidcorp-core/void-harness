import { describe, expect, it } from 'vitest';
import { assessEvidence } from './invalidation.js';
import { sealEvidence } from './schema.js';
import { DIFF_A, evidenceDraft } from '../test/evidence.js';

const DIFF_B = `sha256:${'c'.repeat(64)}`;

describe('evidence invalidation', () => {
  it('marks a diff-dependent proof stale when the current diff changes', () => {
    const evidence = sealEvidence(evidenceDraft());

    expect(
      assessEvidence(evidence, {
        dependencies: { 'git:working-tree': DIFF_B },
      }),
    ).toMatchObject({
      status: 'stale',
      staleDependencies: ['git:working-tree'],
    });
  });

  it('does not invalidate an unrelated proof', () => {
    const evidence = sealEvidence(
      evidenceDraft({
        dependencies: [
          {
            kind: 'input',
            key: 'architecture:contract',
            hash: evidenceDraft().inputHash,
          },
        ],
      }),
    );

    expect(
      assessEvidence(evidence, {
        dependencies: {
          'git:working-tree': DIFF_B,
          'architecture:contract': evidence.inputHash,
        },
      }),
    ).toEqual({ status: 'fresh', staleDependencies: [] });
    expect(evidence.diffHash).toBe(DIFF_A);
  });
});
