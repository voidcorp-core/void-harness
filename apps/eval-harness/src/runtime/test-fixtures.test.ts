import { describe, expect, it } from 'vitest';
import { specialistCompletion } from './test-fixtures.js';

describe('specialist completion fixture', () => {
  it('builds a valid pass completion tied to the requested specialist', () => {
    expect(specialistCompletion('core:test-qa-engineer')).toEqual({
      schemaVersion: 1,
      specialistId: 'core:test-qa-engineer',
      contractVersion: 2,
      completionId: 'cmp_test-qa-engineer',
      verdict: 'pass',
      findings: [],
      evidenceRequests: [],
      limitations: [],
    });
  });
});
