import { describe, expect, it } from 'vitest';
import { publishedVersionCheck } from './freshness-check.js';

describe('publishedVersionCheck', () => {
  it('reports the gap and the fix when the install is behind', () => {
    const check = publishedVersionCheck({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, 'local');
    expect(check).toMatchObject({ name: 'published version', ok: true });
    expect(check.message).toContain('0.17.0');
    expect(check.message).toContain('2.1.0');
    expect(check.fix).toContain('void-harness update');
  });

  it('never blocks: being behind is advisory, not a failed check', () => {
    const check = publishedVersionCheck({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, 'local');
    expect(check.ok).toBe(true);
    expect(check.status).toBe('advisory');
  });

  it('confirms a current install', () => {
    const check = publishedVersionCheck({ verdict: 'up-to-date', installed: '2.1.0', latest: '2.1.0' }, 'local');
    expect(check).toMatchObject({ ok: true, status: 'pass' });
    expect(check.message).toContain('2.1.0');
    expect(check.fix).toBeUndefined();
  });

  it('states plainly that a local build leads the registry', () => {
    const check = publishedVersionCheck({ verdict: 'ahead', installed: '2.2.0', latest: '2.1.0' }, 'local');
    expect(check.status).toBe('pass');
    expect(check.message).toMatch(/ahead|newer than/i);
  });

  it('surfaces the reason instead of a verdict it cannot support', () => {
    const check = publishedVersionCheck(
      { verdict: 'unknown', installed: '2.1.0', reason: 'network error' },
      'local',
    );
    expect(check).toMatchObject({ ok: true, status: 'unknown' });
    expect(check.message).toContain('network error');
    expect(check.message).not.toMatch(/up to date/i);
  });

  it('points a marketplace install at its own channel rather than at npm', () => {
    const check = publishedVersionCheck({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, 'marketplace');
    expect(check.fix).not.toContain('void-harness update');
    expect(check.fix ?? check.message).toMatch(/marketplace|void-harness check/i);
  });

  it('never advises an update path when the install source is undetermined', () => {
    const check = publishedVersionCheck({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, undefined);
    expect(check.ok).toBe(true);
    expect(check.fix).toBeUndefined();
  });
});
