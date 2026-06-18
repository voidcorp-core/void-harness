import { describe, expect, it } from 'vitest';
import { assertSubscription, subscriptionEnv } from './billing.js';

describe('subscriptionEnv', () => {
  it('strips ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN', () => {
    const out = subscriptionEnv(
      { ANTHROPIC_API_KEY: 'sk-x', ANTHROPIC_AUTH_TOKEN: 'tok', PATH: '/bin' },
      false,
    );
    expect(out.ANTHROPIC_API_KEY).toBeUndefined();
    expect(out.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(out.PATH).toBe('/bin');
  });

  it('keeps API creds when allowApi is true', () => {
    const out = subscriptionEnv({ ANTHROPIC_API_KEY: 'sk-x' }, true);
    expect(out.ANTHROPIC_API_KEY).toBe('sk-x');
  });

  it('does not mutate the input env', () => {
    const input = { ANTHROPIC_API_KEY: 'sk-x' };
    subscriptionEnv(input, false);
    expect(input.ANTHROPIC_API_KEY).toBe('sk-x');
  });
});

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
