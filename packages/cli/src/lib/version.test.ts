import { describe, expect, it } from 'vitest';
import { compareVersions, normalizeVersion } from './version.js';

describe('normalizeVersion', () => {
  it('strips caret', () => {
    expect(normalizeVersion('^0.1.0')).toBe('0.1.0');
  });
  it('strips tilde', () => {
    expect(normalizeVersion('~1.2.3')).toBe('1.2.3');
  });
  it('strips leading v', () => {
    expect(normalizeVersion('v2.0.0')).toBe('2.0.0');
  });
  it('preserves a clean version', () => {
    expect(normalizeVersion('0.3.1')).toBe('0.3.1');
  });
});

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
  });
  it('returns -1 when local is behind remote', () => {
    expect(compareVersions('^0.1.0', '0.2.0')).toBe(-1);
    expect(compareVersions('0.1.0', '0.1.1')).toBe(-1);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
  });
  it('returns 1 when local is ahead of remote', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBe(1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
  });
  it('treats missing patch as zero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBe(-1);
  });
});
