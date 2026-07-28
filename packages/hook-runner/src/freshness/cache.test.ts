import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CACHE_TTL_MS, cacheFilePath, readFreshnessCache, writeFreshnessCache } from './cache.js';

const tempHome = (): Promise<string> => mkdtemp(join(tmpdir(), 'void-freshness-'));

describe('cacheFilePath', () => {
  it('honours XDG_CACHE_HOME', async () => {
    const dir = await tempHome();
    expect(cacheFilePath({ XDG_CACHE_HOME: dir })).toBe(join(dir, 'void-harness', 'freshness.json'));
  });

  it('falls back to ~/.cache when XDG_CACHE_HOME is unset', async () => {
    const home = await tempHome();
    expect(cacheFilePath({ HOME: home })).toBe(join(home, '.cache', 'void-harness', 'freshness.json'));
  });

  it('returns undefined when no home directory can be resolved', () => {
    expect(cacheFilePath({})).toBeUndefined();
  });

  it('never resolves inside the consumer project, so a repo is never polluted', async () => {
    const home = await tempHome();
    const path = cacheFilePath({ HOME: home });
    expect(path).not.toContain('/.void/');
    expect(path).toContain('void-harness');
  });
});

describe('writeFreshnessCache / readFreshnessCache', () => {
  it('round-trips an entry that is still within its TTL', async () => {
    const env = { XDG_CACHE_HOME: await tempHome() };
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 1_000 });
    expect(readFreshnessCache(env, 1_000 + CACHE_TTL_MS - 1)).toEqual({
      latest: '2.1.0',
      checkedAt: 1_000,
    });
  });

  it('treats an entry past its TTL as absent', async () => {
    const env = { XDG_CACHE_HOME: await tempHome() };
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 1_000 });
    expect(readFreshnessCache(env, 1_000 + CACHE_TTL_MS + 1)).toBeUndefined();
  });

  it('treats an entry stamped in the future as absent, so a skewed clock cannot pin it forever', async () => {
    const env = { XDG_CACHE_HOME: await tempHome() };
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 10_000 });
    expect(readFreshnessCache(env, 5_000)).toBeUndefined();
  });

  it('returns undefined when nothing was ever written', async () => {
    expect(readFreshnessCache({ XDG_CACHE_HOME: await tempHome() }, 1_000)).toBeUndefined();
  });

  it.each(['', '{', '[]', 'null', '{"latest":42}', '{"checkedAt":"soon"}'])(
    'returns undefined on the corrupt payload %j instead of crashing the caller',
    async (payload) => {
      const dir = await tempHome();
      const env = { XDG_CACHE_HOME: dir };
      const path = cacheFilePath(env) ?? '';
      await mkdir(join(dir, 'void-harness'), { recursive: true });
      await writeFile(path, payload, 'utf8');
      expect(readFreshnessCache(env, 1_000)).toBeUndefined();
    },
  );

  it('stores only the published version and a timestamp — nothing about the machine', async () => {
    const env = { XDG_CACHE_HOME: await tempHome() };
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 1_000 });
    const raw = JSON.parse(await readFile(cacheFilePath(env) ?? '', 'utf8')) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(['checkedAt', 'latest']);
  });

  it('overwrites a previous entry rather than appending', async () => {
    const env = { XDG_CACHE_HOME: await tempHome() };
    await writeFreshnessCache(env, { latest: '2.0.0', checkedAt: 1_000 });
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 2_000 });
    expect(readFreshnessCache(env, 2_000)?.latest).toBe('2.1.0');
  });

  it('never throws when the cache location cannot be resolved or written', async () => {
    await expect(writeFreshnessCache({}, { latest: '2.1.0', checkedAt: 1 })).resolves.toBeUndefined();
    expect(readFreshnessCache({}, 1)).toBeUndefined();
  });

  it('leaves no temporary file behind after a successful write', async () => {
    const dir = await tempHome();
    const env = { XDG_CACHE_HOME: dir };
    await writeFreshnessCache(env, { latest: '2.1.0', checkedAt: 1_000 });
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(join(dir, 'void-harness'));
    expect(entries).toEqual(['freshness.json']);
  });
});
