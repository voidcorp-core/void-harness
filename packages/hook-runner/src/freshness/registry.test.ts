import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_REGISTRY, distTagsUrl, fetchLatestVersion, parseLatestTag, resolveRegistry } from './registry.js';

const ok = (body: unknown): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

const failing = (status: number): typeof fetch =>
  vi.fn(async () => new Response('', { status })) as unknown as typeof fetch;

describe('resolveRegistry', () => {
  it('defaults to the public npm registry', () => {
    expect(resolveRegistry({})).toBe(DEFAULT_REGISTRY);
  });

  it.each(['npm_config_registry', 'NPM_CONFIG_REGISTRY'])('honours %s', (key) => {
    expect(resolveRegistry({ [key]: 'https://registry.internal.corp/' })).toBe(
      'https://registry.internal.corp',
    );
  });

  it('honours a registry declared in .npmrc when the environment is silent', () => {
    expect(resolveRegistry({}, 'registry=https://nexus.corp/repository/npm/\n')).toBe(
      'https://nexus.corp/repository/npm',
    );
  });

  it('lets the environment win over .npmrc, matching npm resolution order', () => {
    expect(resolveRegistry({ npm_config_registry: 'https://env.example' }, 'registry=https://file.example')).toBe(
      'https://env.example',
    );
  });

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'http://insecure.example',
    'not a url',
    '',
  ])('refuses the unsafe or unusable registry %j and falls back to the default', (value) => {
    expect(resolveRegistry({ npm_config_registry: value })).toBe(DEFAULT_REGISTRY);
  });

  it('ignores commented and unrelated .npmrc lines', () => {
    const npmrc = '# registry=https://commented.example\n//registry.npmjs.org/:_authToken=SECRET\nfoo=bar\n';
    expect(resolveRegistry({}, npmrc)).toBe(DEFAULT_REGISTRY);
  });
});

describe('distTagsUrl', () => {
  it('targets the small dist-tags document, not the full package document', () => {
    expect(distTagsUrl(DEFAULT_REGISTRY, 'voidharness')).toBe(
      'https://registry.npmjs.org/-/package/voidharness/dist-tags',
    );
  });

  it('encodes a scoped package name', () => {
    expect(distTagsUrl(DEFAULT_REGISTRY, '@voidcorp/harness')).toContain('%40voidcorp%2Fharness');
  });

  it.each(['../../etc/passwd', 'a/../b', ''])('refuses the unsafe package name %j', (pkg) => {
    expect(() => distTagsUrl(DEFAULT_REGISTRY, pkg)).toThrow(/package name/i);
  });
});

describe('parseLatestTag', () => {
  it('reads the latest tag', () => {
    expect(parseLatestTag({ latest: '2.1.0', next: '3.0.0-rc.1' })).toBe('2.1.0');
  });

  it.each([{}, { latest: 42 }, { latest: '' }, [], 'nope', undefined])(
    'returns undefined on the malformed payload %j',
    (payload) => {
      expect(parseLatestTag(payload)).toBeUndefined();
    },
  );
});

describe('fetchLatestVersion', () => {
  it('returns the published version on a healthy response', async () => {
    await expect(fetchLatestVersion({ fetchImpl: ok({ latest: '2.1.0' }) })).resolves.toEqual({
      latest: '2.1.0',
    });
  });

  it('sends nothing from the machine beyond a bare user-agent', async () => {
    const spy = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ latest: '2.1.0' }), { status: 200 }),
    );
    await fetchLatestVersion({ fetchImpl: spy as unknown as typeof fetch });
    const init = spy.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect([...headers.keys()]).toEqual(['user-agent']);
    expect(headers.get('user-agent')).toBe('void-harness');
    expect(init?.credentials).not.toBe('include');
  });

  it('reports a network error rather than throwing', async () => {
    const boom = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    });
    const result = await fetchLatestVersion({ fetchImpl: boom as unknown as typeof fetch });
    expect(result.latest).toBeUndefined();
    expect(result.reason).toMatch(/network/i);
  });

  it.each([
    [403, /rate/i],
    [429, /rate/i],
    [404, /404/],
    [500, /500/],
  ])('distinguishes HTTP %i', async (status, expected) => {
    const result = await fetchLatestVersion({ fetchImpl: failing(status) });
    expect(result.latest).toBeUndefined();
    expect(result.reason).toMatch(expected);
  });

  it('reports a malformed body instead of surfacing a parse crash', async () => {
    const html = vi.fn(async () => new Response('<html>captive portal</html>', { status: 200 }));
    const result = await fetchLatestVersion({ fetchImpl: html as unknown as typeof fetch });
    expect(result.reason).toMatch(/malformed/i);
  });

  it('reports a well-formed body that carries no usable latest tag', async () => {
    const result = await fetchLatestVersion({ fetchImpl: ok({ next: '3.0.0' }) });
    expect(result.latest).toBeUndefined();
    expect(result.reason).toMatch(/latest/i);
  });

  it('passes an abort signal so a hung registry cannot stall the caller', async () => {
    const spy = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ latest: '2.1.0' }), { status: 200 }),
    );
    await fetchLatestVersion({ fetchImpl: spy as unknown as typeof fetch, timeoutMs: 250 });
    expect(spy.mock.calls[0]?.[1]?.signal).toBeDefined();
  });

  it('reports a timeout distinctly from a generic network failure', async () => {
    const aborted = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    const result = await fetchLatestVersion({ fetchImpl: aborted as unknown as typeof fetch });
    expect(result.reason).toMatch(/timed out/i);
  });
});
