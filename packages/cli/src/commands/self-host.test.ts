import { describe, expect, it } from 'vitest';
import {
  parseSelfHostArgs,
  selfHostExitCode,
} from './self-host.js';

describe('self-host CLI contract', () => {
  it('defaults sync to shadow and accepts every rollout mode', () => {
    expect(parseSelfHostArgs(['sync'])).toEqual({
      action: 'sync',
      mode: 'shadow',
    });
    expect(parseSelfHostArgs(['doctor', '--mode', 'release-gate'])).toEqual({
      action: 'doctor',
      mode: 'release-gate',
    });
  });

  it('fails only blocking states in enforce and release-gate modes', () => {
    expect(selfHostExitCode('stale', 'shadow')).toBe(0);
    expect(selfHostExitCode('stale', 'warn')).toBe(0);
    expect(selfHostExitCode('stale', 'enforce')).toBe(2);
    expect(selfHostExitCode('drifted', 'release-gate')).toBe(2);
    expect(selfHostExitCode('degraded', 'release-gate')).toBe(0);
  });

  it('rejects unknown flags instead of silently weakening the requested mode', () => {
    expect(() => parseSelfHostArgs(['sync', '--unknown'])).toThrow(
      'self-host accepts only --mode',
    );
  });
});
