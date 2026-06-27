import { describe, expect, it } from 'vitest';
import { isError } from './types.js';

describe('isError', () => {
  it('is true for error severity', () => {
    expect(isError({ kind: 'k', severity: 'error', nodes: [], evidence: 'e', suggestion: 's' })).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isError({ kind: 'k', severity: 'warning', nodes: [], evidence: 'e', suggestion: 's' })).toBe(false);
  });
});
