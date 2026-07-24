import { describe, expect, it } from 'vitest';
import {
  parseEvidence,
  sealEvidence,
  verifyEvidenceIntegrity,
} from './schema.js';
import { evidenceDraft } from '../test/evidence.js';

describe('evidence schema', () => {
  it('seals and verifies a bounded command proof', () => {
    const sealed = sealEvidence(evidenceDraft());

    expect(parseEvidence(sealed)).toEqual({ ok: true, value: sealed });
    expect(verifyEvidenceIntegrity(sealed)).toBe(true);
  });

  it('detects evidence tampering after sealing', () => {
    const sealed = sealEvidence(evidenceDraft());
    const tampered = { ...sealed, confidence: 'medium' as const };

    expect(verifyEvidenceIntegrity(tampered)).toBe(false);
    expect(parseEvidence(tampered)).toMatchObject({
      ok: false,
      issue: { code: 'evidence-integrity-mismatch' },
    });
  });

  it('rejects unbounded output before it can enter the event journal', () => {
    expect(() =>
      sealEvidence(
        evidenceDraft({
          output: {
            stdout: 'x'.repeat(9_000),
            stderr: '',
            truncated: false,
          },
        }),
      )
    ).toThrow('EVIDENCE_INVALID');
  });

  it('rejects an oversized proof even when each field is individually valid', () => {
    expect(() =>
      sealEvidence(
        evidenceDraft({
          command: Array.from({ length: 20 }, (_, index) =>
            `${index}-${'x'.repeat(800)}`
          ),
        }),
      )
    ).toThrow('evidence exceeds');
  });
});
