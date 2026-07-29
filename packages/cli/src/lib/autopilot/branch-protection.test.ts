import { describe, expect, it } from 'vitest';
import { decideBranchProtection, interpretProtectionResponse, type ProtectionObservation } from './branch-protection.js';

function decision(observation: ProtectionObservation) {
  return decideBranchProtection(observation, 'main');
}

describe('decideBranchProtection', () => {
  it('allows a base whose protection was positively observed', () => {
    expect(decision({ kind: 'protected', requiredChecks: ['validate'] })).toMatchObject({ allowed: true });
  });

  it('blocks a base observed as unprotected because the remote is the durable boundary', () => {
    const result = decision({ kind: 'unprotected' });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unprotected');
    expect(result.detail).toContain('main');
  });

  it('blocks an indeterminate observation because unknown is not permission', () => {
    const result = decision({ kind: 'unknown', reason: 'gh is not authenticated' });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unknown');
    expect(result.detail).toContain('gh is not authenticated');
  });

  it('blocks a protected base that requires no status check at all', () => {
    // Protection that gates nothing is protection in name only: a PR could merge
    // with a red suite, which is exactly what the gate exists to prevent.
    const result = decision({ kind: 'protected', requiredChecks: [] });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no-required-checks');
  });

  it('blocks an observation whose shape it does not recognise', () => {
    const result = decideBranchProtection({ kind: 'probably-fine' } as unknown as ProtectionObservation, 'main');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('malformed-observation');
  });
});

describe('interpretProtectionResponse', () => {
  it('reads a protection payload with its required checks', () => {
    const observation = interpretProtectionResponse({
      ok: true,
      status: 200,
      body: JSON.stringify({ required_status_checks: { contexts: ['validate', 'enforce'] } }),
    });

    expect(observation).toEqual({ kind: 'protected', requiredChecks: ['validate', 'enforce'] });
  });

  it('reads the newer checks array when contexts is absent', () => {
    const observation = interpretProtectionResponse({
      ok: true,
      status: 200,
      body: JSON.stringify({ required_status_checks: { checks: [{ context: 'validate' }] } }),
    });

    expect(observation).toEqual({ kind: 'protected', requiredChecks: ['validate'] });
  });

  it('reports a protected branch with no required checks rather than inventing one', () => {
    const observation = interpretProtectionResponse({ ok: true, status: 200, body: JSON.stringify({}) });

    expect(observation).toEqual({ kind: 'protected', requiredChecks: [] });
  });

  it("reads GitHub's 404 'Branch not protected' as unprotected, not as an error", () => {
    const observation = interpretProtectionResponse({
      ok: false,
      status: 404,
      body: JSON.stringify({ message: 'Branch not protected' }),
    });

    expect(observation).toEqual({ kind: 'unprotected' });
  });

  it('treats any other failure as unknown, keeping the reason', () => {
    const observation = interpretProtectionResponse({ ok: false, status: 401, body: 'Bad credentials' });

    expect(observation.kind).toBe('unknown');
    expect((observation as { reason: string }).reason).toContain('Bad credentials');
  });

  it('treats a non-JSON success body as unknown rather than as protection', () => {
    const observation = interpretProtectionResponse({ ok: true, status: 200, body: '<html>login</html>' });

    expect(observation.kind).toBe('unknown');
  });

  it('treats an empty success body as unknown', () => {
    expect(interpretProtectionResponse({ ok: true, status: 200, body: 'null' }).kind).toBe('unknown');
  });

  it('truncates a huge failure body so one error cannot flood the run', () => {
    const observation = interpretProtectionResponse({ ok: false, status: 500, body: 'x'.repeat(50_000) });

    expect((observation as { reason: string }).reason.length).toBeLessThan(500);
  });
});
