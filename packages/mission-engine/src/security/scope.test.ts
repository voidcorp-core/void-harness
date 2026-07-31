import { describe, expect, it } from 'vitest';
import {
  authorizeRedirect,
  authorizeTarget,
  type ScopeAuthorization,
} from './scope.js';

const NOW = '2026-07-31T12:00:00.000Z';

function authorization(over: Partial<ScopeAuthorization> = {}): ScopeAuthorization {
  return {
    hosts: ['staging.example.test'],
    authorizedBy: 'folpe',
    authorizedAt: '2026-07-31T09:00:00.000Z',
    expiresAt: '2026-07-31T18:00:00.000Z',
    destructive: false,
    ephemeralTarget: true,
    ...over,
  };
}

describe('a target nobody authorized', () => {
  it('is refused, which is the whole point of this module', () => {
    const verdict = authorizeTarget('https://example.com/login', null, NOW);

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.reason).toBe('no-authorization');
    expect(verdict.detail).toMatch(/example\.com/);
  });

  it('is refused even when the run is otherwise non-destructive', () => {
    // Read-only against someone else's host is still someone else's host.
    expect(authorizeTarget('https://example.com/', null, NOW).kind).toBe('refused');
  });
});

describe('loopback is local, and only literally', () => {
  it('allows literal loopback without any authorization', () => {
    for (const target of ['http://127.0.0.1:3000/', 'http://[::1]:8080/', 'http://localhost:5173/']) {
      expect(authorizeTarget(target, null, NOW).kind, target).toBe('allowed');
    }
  });

  it('refuses a hostname that merely might resolve to loopback', () => {
    // DNS rebinding: `local.attacker.test` can answer 127.0.0.1 today and a
    // public address at the next lookup. This module resolves nothing, so a
    // name it cannot prove is loopback is treated as external — the safe bias.
    const verdict = authorizeTarget('http://local.attacker.test:3000/', null, NOW);

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.reason).toBe('no-authorization');
  });

  it('refuses a private-range literal, because a LAN host is not this machine', () => {
    for (const target of ['http://192.168.1.10/', 'http://10.0.0.5/', 'http://172.16.4.2/']) {
      expect(authorizeTarget(target, null, NOW).kind, target).toBe('refused');
    }
  });
});

describe('an authorized target', () => {
  it('is allowed when the host is named exactly', () => {
    const verdict = authorizeTarget('https://staging.example.test/health', authorization(), NOW);

    expect(verdict.kind).toBe('allowed');
  });

  it('is refused for a host the authorization does not name', () => {
    const verdict = authorizeTarget('https://prod.example.test/', authorization(), NOW);

    expect(verdict).toMatchObject({ kind: 'refused', reason: 'host-not-authorized' });
  });

  it('is refused for a subdomain, because scope is not inherited downward', () => {
    // `staging.example.test` authorizes that host. Not `api.staging.example.test`,
    // which may be a different service with a different owner.
    const verdict = authorizeTarget('https://api.staging.example.test/', authorization(), NOW);

    expect(verdict).toMatchObject({ kind: 'refused', reason: 'host-not-authorized' });
  });

  it('compares hosts case-insensitively but ignores the port', () => {
    expect(authorizeTarget('https://STAGING.EXAMPLE.TEST:8443/', authorization(), NOW).kind).toBe(
      'allowed',
    );
  });
});

describe('an authorization is a time-boxed grant', () => {
  it('is refused once it has expired', () => {
    const verdict = authorizeTarget(
      'https://staging.example.test/',
      authorization({ expiresAt: '2026-07-31T11:59:59.000Z' }),
      NOW,
    );

    expect(verdict).toMatchObject({ kind: 'refused', reason: 'authorization-expired' });
  });

  it('is refused when its window cannot be read, rather than treated as open', () => {
    for (const expiresAt of ['', 'soon', '2026-13-45']) {
      const verdict = authorizeTarget(
        'https://staging.example.test/',
        authorization({ expiresAt }),
        NOW,
      );
      expect(verdict, expiresAt).toMatchObject({ kind: 'refused', reason: 'authorization-malformed' });
    }
  });

  it('is refused when nobody is named as the authorizer', () => {
    const verdict = authorizeTarget(
      'https://staging.example.test/',
      authorization({ authorizedBy: '  ' }),
      NOW,
    );

    expect(verdict).toMatchObject({ kind: 'refused', reason: 'authorization-malformed' });
  });

  it('is refused when it names no host at all', () => {
    const verdict = authorizeTarget('https://staging.example.test/', authorization({ hosts: [] }), NOW);

    expect(verdict).toMatchObject({ kind: 'refused', reason: 'authorization-malformed' });
  });
});

describe('a shared target is not an ephemeral one', () => {
  it('is refused when the authorization does not say the target is disposable', () => {
    const verdict = authorizeTarget(
      'https://staging.example.test/',
      authorization({ ephemeralTarget: false }),
      NOW,
    );

    expect(verdict).toMatchObject({ kind: 'refused', reason: 'shared-target' });
    if (verdict.kind !== 'refused') return;
    expect(verdict.detail).toMatch(/ephemeral/i);
  });
});

describe('the scheme', () => {
  it('accepts only http and https', () => {
    for (const target of ['file:///etc/passwd', 'ftp://example.test/', 'gopher://x/']) {
      expect(authorizeTarget(target, authorization({ hosts: ['x', 'example.test'] }), NOW), target).toMatchObject({
        kind: 'refused',
        reason: 'unsupported-scheme',
      });
    }
  });

  it('refuses what is not a URL at all rather than guessing', () => {
    for (const target of ['', 'staging.example.test', 'not a url']) {
      expect(authorizeTarget(target, authorization(), NOW), target).toMatchObject({
        kind: 'refused',
        reason: 'not-a-url',
      });
    }
  });
});

describe('redirects', () => {
  it('follow only into the same authorized scope', () => {
    const verdict = authorizeRedirect(
      'https://staging.example.test/a',
      'https://staging.example.test/b',
      authorization(),
      NOW,
    );

    expect(verdict.kind).toBe('allowed');
  });

  it('are refused when they leave the scope, which is how a scan escapes it', () => {
    const verdict = authorizeRedirect(
      'https://staging.example.test/a',
      'https://evil.example.com/',
      authorization(),
      NOW,
    );

    expect(verdict).toMatchObject({ kind: 'refused', reason: 'redirect-leaves-scope' });
    if (verdict.kind !== 'refused') return;
    expect(verdict.detail).toMatch(/evil\.example\.com/);
  });

  it('are refused when they leave an authorized host for loopback', () => {
    // The inverse of the usual worry: a redirect to 127.0.0.1 turns an external
    // scan into a probe of the machine running it.
    const verdict = authorizeRedirect(
      'https://staging.example.test/a',
      'http://127.0.0.1:8080/admin',
      authorization(),
      NOW,
    );

    expect(verdict).toMatchObject({ kind: 'refused', reason: 'redirect-leaves-scope' });
  });

  it('are refused when the destination is unreadable', () => {
    expect(
      authorizeRedirect('https://staging.example.test/a', 'not a url', authorization(), NOW),
    ).toMatchObject({ kind: 'refused', reason: 'not-a-url' });
  });
});

describe('destructive probing', () => {
  it('is off unless the authorization says otherwise', () => {
    const verdict = authorizeTarget('https://staging.example.test/', authorization(), NOW);

    expect(verdict.kind).toBe('allowed');
    if (verdict.kind !== 'allowed') return;
    expect(verdict.destructiveAllowed).toBe(false);
  });

  it('is on only when explicitly granted', () => {
    const verdict = authorizeTarget(
      'https://staging.example.test/',
      authorization({ destructive: true }),
      NOW,
    );

    expect(verdict.kind).toBe('allowed');
    if (verdict.kind !== 'allowed') return;
    expect(verdict.destructiveAllowed).toBe(true);
  });

  it('is never granted for loopback by default either', () => {
    const verdict = authorizeTarget('http://127.0.0.1:3000/', null, NOW);

    expect(verdict.kind).toBe('allowed');
    if (verdict.kind !== 'allowed') return;
    expect(verdict.destructiveAllowed).toBe(false);
  });
});

describe('what a verdict carries', () => {
  it('never repeats the credentials a target URL may embed', () => {
    const verdict = authorizeTarget('https://user:hunter2@example.com/', null, NOW);

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(JSON.stringify(verdict)).not.toContain('hunter2');
    expect(JSON.stringify(verdict)).not.toContain('user:');
  });

  it('names the host it judged, so the refusal is actionable', () => {
    const verdict = authorizeTarget('https://prod.example.test/x?token=abc', authorization(), NOW);

    if (verdict.kind !== 'refused') throw new Error('expected a refusal');
    expect(verdict.detail).toContain('prod.example.test');
    // The query string can carry a token; it is never part of the decision.
    expect(JSON.stringify(verdict)).not.toContain('abc');
  });
});
