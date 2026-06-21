import { describe, expect, it } from 'vitest';
import { assertSubscription } from './billing.js';

describe('assertSubscription', () => {
  it('is ok with no special vars', () => {
    const r = assertSubscription({ PATH: '/bin' }, false);
    expect(r.ok).toBe(true);
    expect(r.stripped).toEqual([]);
  });

  it('reports which API creds will be stripped', () => {
    const r = assertSubscription({ ANTHROPIC_API_KEY: 'sk-x' }, false);
    expect(r.ok).toBe(true);
    expect(r.stripped).toEqual(['ANTHROPIC_API_KEY']);
  });

  it('refuses when a cloud-provider var forces non-subscription routing', () => {
    const r = assertSubscription({ CLAUDE_CODE_USE_BEDROCK: '1' }, false);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/CLAUDE_CODE_USE_BEDROCK/);
  });

  it('allows a cloud-provider var when allowApi is set', () => {
    const r = assertSubscription({ CLAUDE_CODE_USE_VERTEX: '1' }, true);
    expect(r.ok).toBe(true);
  });
});
