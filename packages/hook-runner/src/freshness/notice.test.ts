import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CACHE_TTL_MS, writeFreshnessCache } from './cache.js';
import { freshnessNotice, resolveFreshness } from './notice.js';

const tempEnv = async (): Promise<{ XDG_CACHE_HOME: string }> => ({
  XDG_CACHE_HOME: await mkdtemp(join(tmpdir(), 'void-notice-')),
});

const serving = (latest: string): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify({ latest }), { status: 200 })) as unknown as typeof fetch;

const offline = (): typeof fetch =>
  vi.fn(async () => {
    throw new Error('ENETDOWN');
  }) as unknown as typeof fetch;

describe('resolveFreshness', () => {
  it('reads the registry when no cache exists, and remembers the answer', async () => {
    const env = await tempEnv();
    const fetchImpl = serving('2.1.0');
    const first = await resolveFreshness({ installed: '0.17.0', env, now: 1_000, fetchImpl });
    expect(first).toMatchObject({ verdict: 'behind', latest: '2.1.0' });

    const second = await resolveFreshness({ installed: '0.17.0', env, now: 2_000, fetchImpl });
    expect(second).toMatchObject({ verdict: 'behind', latest: '2.1.0' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('goes back to the registry once the cached answer expires', async () => {
    const env = await tempEnv();
    const fetchImpl = serving('2.2.0');
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 0 });
    const result = await resolveFreshness({ installed: '2.1.0', env, now: CACHE_TTL_MS + 1, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ verdict: 'behind', latest: '2.2.0' });
  });

  it('never touches the network when the caller forbids it', async () => {
    const env = await tempEnv();
    const fetchImpl = serving('2.1.0');
    const result = await resolveFreshness({
      installed: '0.17.0',
      env,
      now: 1_000,
      fetchImpl,
      allowNetwork: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.verdict).toBe('unknown');
  });

  it('answers from cache alone when the network is forbidden but an entry is fresh', async () => {
    const env = await tempEnv();
    const fetchImpl = serving('9.9.9');
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 1_000 });
    const result = await resolveFreshness({
      installed: '0.17.0',
      env,
      now: 1_500,
      fetchImpl,
      allowNetwork: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ verdict: 'behind', latest: '2.1.0' });
  });

  it('degrades to unknown with the network reason when the registry is unreachable', async () => {
    const env = await tempEnv();
    const result = await resolveFreshness({ installed: '0.17.0', env, now: 1_000, fetchImpl: offline() });
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toMatch(/network/i);
  });

  it('never reports up-to-date when the registry could not be read', async () => {
    const env = await tempEnv();
    const result = await resolveFreshness({ installed: '2.1.0', env, now: 1_000, fetchImpl: offline() });
    expect(result.verdict).not.toBe('up-to-date');
  });

  it('does not cache a failed lookup, so a transient outage is retried', async () => {
    const env = await tempEnv();
    await resolveFreshness({ installed: '2.1.0', env, now: 1_000, fetchImpl: offline() });
    const recovered = serving('2.2.0');
    const result = await resolveFreshness({ installed: '2.1.0', env, now: 1_100, fetchImpl: recovered });
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ verdict: 'behind' });
  });
});

describe('freshnessNotice', () => {
  it('names both versions and the exact command when an npm install is behind', () => {
    const notice = freshnessNotice({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, 'local');
    expect(notice).toContain('0.17.0');
    expect(notice).toContain('2.1.0');
    expect(notice).toContain('void-harness update');
  });

  it.each(['up-to-date', 'ahead', 'unknown'] as const)('stays silent on the %s verdict', (verdict) => {
    expect(freshnessNotice({ verdict, installed: '2.1.0', latest: '2.1.0' }, 'local')).toBeUndefined();
  });

  it('stays silent for a marketplace install, whose update path is not this command', () => {
    expect(
      freshnessNotice({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, 'marketplace'),
    ).toBeUndefined();
  });

  it('stays silent when the install source is unknown rather than advising blindly', () => {
    expect(freshnessNotice({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, undefined)).toBeUndefined();
  });

  it('is a single line, so a session banner never turns into a wall of text', () => {
    const notice = freshnessNotice({ verdict: 'behind', installed: '0.17.0', latest: '2.1.0' }, 'local') ?? '';
    expect(notice).not.toContain('\n');
  });
});
