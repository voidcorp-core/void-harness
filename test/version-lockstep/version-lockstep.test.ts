/**
 * Tests for scripts/check-version-lockstep.mjs — the lockstep version guard.
 * The pure findDrift() is the load-bearing logic; collect() reads the real repo.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script, no types
import { findDrift, collect } from '../../scripts/check-version-lockstep.mjs';
import { resolve } from 'node:path';

describe('findDrift', () => {
  it('returns [] when every file matches the canonical version', () => {
    const entries = [
      { file: 'a', version: '0.6.0' },
      { file: 'b', version: '0.6.0' },
    ];
    expect(findDrift('0.6.0', entries)).toEqual([]);
  });

  it('flags every file that diverges', () => {
    const entries = [
      { file: 'a', version: '0.6.0' },
      { file: 'b', version: '0.5.4' },
      { file: 'c', version: '0.7.0' },
    ];
    const drift = findDrift('0.6.0', entries);
    expect(drift).toHaveLength(2);
    expect(drift[0]).toContain('b');
    expect(drift[1]).toContain('c');
  });
});

describe('collect (real repo)', () => {
  it('finds a canonical version and all manifests aligned to it', async () => {
    const root = resolve(process.cwd());
    const { canonical, entries } = await collect(root);
    expect(canonical).toMatch(/^\d+\.\d+\.\d+$/);
    expect(entries.length).toBeGreaterThan(10);
    // The repo must be in lockstep at all times.
    expect(findDrift(canonical, entries)).toEqual([]);
  });
});
