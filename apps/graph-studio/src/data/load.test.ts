import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDataFromServer, resolveStudioBoot } from './load.js';

const payload = {
  model: { version: 1, nodes: [], edges: [] },
  findings: [],
  usage: { counts: {}, usedSkillNames: ['tdd'] },
  workflows: {},
};

describe('loadDataFromServer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches the server-computed StudioData from same-origin /studio-data.json', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const data = await loadDataFromServer('http://localhost:4317');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4317/studio-data.json',
      { credentials: 'include' },
    );
    expect(data.model.version).toBe(1);
    expect(data.usage.usedSkillNames).toEqual(['tdd']);
  });

  it('throws a clear error when the server responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(loadDataFromServer('http://x')).rejects.toThrow(/studio-data fetch failed: 404/);
  });
});

describe('resolveStudioBoot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is server-fed when served from an http origin', async () => {
    vi.stubGlobal('location', { origin: 'http://localhost:4317' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
    const boot = await resolveStudioBoot();
    expect(boot.liveUrl).toBe('http://localhost:4317');
    expect(boot.data.usage.usedSkillNames).toEqual(['tdd']);
  });

  it('warns and falls back to the build-time snapshot when the server fetch fails', async () => {
    vi.stubGlobal('location', { origin: 'http://localhost:4317' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const boot = await resolveStudioBoot();
    expect(warn).toHaveBeenCalled();
    expect(boot.data.model.nodes.length).toBeGreaterThan(0); // real generated snapshot
  });
});
