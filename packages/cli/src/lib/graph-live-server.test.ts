import type { AddressInfo } from 'node:net';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { corsFor, startLiveServer, type LiveServerOptions } from './graph-live-server.js';

const MODEL = JSON.stringify({ version: 1, nodes: [], edges: [] });
const CATALOG = JSON.stringify({ schemaVersion: 3, graphId: 'catalog:test' });
const LAUNCH_TOKEN = 'launch-token-with-enough-entropy-for-tests';

function canonical(seq: number): string {
  return JSON.stringify({
    schemaVersion: 1,
    seq,
    eventId: `evt_${String(seq).padStart(8, '0')}`,
    missionId: 'mis_0123456789abcdef',
    ts: new Date(Date.UTC(2026, 6, 24, 12, 0, seq)).toISOString(),
    source: 'runtime:codex',
    kind: 'runtime.tool.started',
    subject: 'skill:harness:tdd',
    correlationId: 'mis_0123456789abcdef',
    payload: { category: 'skill', tool: 'Skill', fileGlobs: [], extensions: [] },
  });
}

function logFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'void-live-'));
  const path = join(dir, 'activations.jsonl');
  writeFileSync(path, '');
  return path;
}

describe('graph live server', () => {
  let server: Server | undefined;
  let cookie = '';
  let activeLog = '';

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server?.close(() => r()));
    server = undefined;
  });

  async function start(opts: Partial<LiveServerOptions>): Promise<number> {
    activeLog = opts.logPath ?? logFile();
    server = startLiveServer({
      port: 0,
      logPath: activeLog,
      modelJson: MODEL,
      launchToken: LAUNCH_TOKEN,
      ...opts,
    });
    await new Promise<void>((r) => server?.once('listening', () => r()));
    const port = (server.address() as AddressInfo).port;
    const auth = await fetch(
      `http://localhost:${port}/auth?token=${encodeURIComponent(LAUNCH_TOKEN)}`,
      { redirect: 'manual' },
    );
    cookie = auth.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(auth.status).toBe(303);
    expect(cookie).toContain('void_mission_session=');
    return port;
  }

  function get(port: number, path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`http://localhost:${port}${path}`, {
      ...init,
      headers: { Cookie: cookie, ...init.headers },
    });
  }

  it('serves the injected studio HTML at GET / with the right content-type', async () => {
    const port = await start({ studioHtml: '<!doctype html><title>studio</title>' });
    const res = await get(port, '/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<title>studio</title>');
  });

  it('still serves /model.json alongside the studio', async () => {
    const port = await start({ studioHtml: '<html></html>' });
    const res = await get(port, '/model.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.text()).toBe(MODEL);
    // A same-origin / non-browser request (no Origin) gets no CORS header — not a wildcard.
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('serves the validated v3 catalog beside the read-only v1 Studio projection', async () => {
    const port = await start({ catalogJson: CATALOG });
    const res = await get(port, '/catalog.v3.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.text()).toBe(CATALOG);
  });

  it('returns 404 on GET / when no studio is bundled (data-only server)', async () => {
    const port = await start({});
    const res = await get(port, '/');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('data-only');
  });

  it('serves the pre-computed studio data at GET /studio-data.json', async () => {
    const studioDataJson = JSON.stringify({ model: JSON.parse(MODEL), findings: [], usage: { counts: {}, usedSkillNames: [] }, workflows: {} });
    const port = await start({ studioDataJson });
    const res = await get(port, '/studio-data.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.text()).toBe(studioDataJson);
  });

  it('returns 404 on /studio-data.json when data was not computed', async () => {
    const port = await start({});
    const res = await get(port, '/studio-data.json');
    expect(res.status).toBe(404);
  });

  it('walks to a free port when the requested one is busy', async () => {
    // Occupy an ephemeral port, then request exactly it: the server must bind a higher one.
    const busy = startLiveServer({
      port: 0,
      logPath: logFile(),
      modelJson: MODEL,
      launchToken: LAUNCH_TOKEN,
    });
    await new Promise<void>((r) => busy.once('listening', () => r()));
    const taken = (busy.address() as AddressInfo).port;
    try {
      let bound = 0;
      const server2 = startLiveServer({
        port: taken,
        logPath: logFile(),
        modelJson: MODEL,
        launchToken: `${LAUNCH_TOKEN}-second`,
        onListening: (p) => {
          bound = p;
        },
      });
      await new Promise<void>((r) => server2.once('listening', () => r()));
      try {
        expect(bound).toBeGreaterThan(taken);
      } finally {
        await new Promise<void>((r) => server2.close(() => r()));
      }
    } finally {
      await new Promise<void>((r) => busy.close(() => r()));
    }
  });

  it('requires a one-shot launch exchange and a private session cookie', async () => {
    const port = await start({});
    const anonymous = await fetch(`http://localhost:${port}/model.json`);
    expect(anonymous.status).toBe(401);
    const replay = await fetch(
      `http://localhost:${port}/auth?token=${encodeURIComponent(LAUNCH_TOKEN)}`,
      { redirect: 'manual' },
    );
    expect(replay.status).toBe(401);
    expect((await get(port, '/model.json')).status).toBe(200);
  });

  it('rejects foreign browser origins before serving local data', async () => {
    const port = await start({});
    const res = await get(port, '/model.json', {
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(403);
  });

  it('reports partial history when a mission sequence has a gap', async () => {
    const path = logFile();
    writeFileSync(path, `${canonical(1)}\n${canonical(3)}\n`);
    const port = await start({ logPath: path });
    const res = await get(port, '/history');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-void-continuity')).toBe('partial');
    expect((await res.json())).toHaveLength(2);
  });

  it('backfills exactly events 51..100 after event 50 and emits SSE IDs', async () => {
    const path = logFile();
    writeFileSync(
      path,
      `${Array.from({ length: 100 }, (_, index) => canonical(index + 1)).join('\n')}\n`,
    );
    const port = await start({ logPath: path, pollMs: 10 });
    const res = await get(port, '/events', {
      headers: { 'Last-Event-ID': 'evt_00000050' },
    });
    expect(res.status).toBe(200);
    const reader = res.body?.getReader();
    const chunk = await reader?.read();
    await reader?.cancel();
    const body = new TextDecoder().decode(chunk?.value);
    const ids = [...body.matchAll(/^id: (.+)$/gm)].map((match) => match[1]);
    expect(ids).toEqual(
      Array.from(
        { length: 50 },
        (_, index) => `evt_${String(index + 51).padStart(8, '0')}`,
      ),
    );
  });

  it('streams an append that happens after connection', async () => {
    const path = logFile();
    writeFileSync(path, `${canonical(1)}\n`);
    const port = await start({ logPath: path, pollMs: 10 });
    const res = await get(port, '/events');
    const reader = res.body?.getReader();
    await reader?.read();
    appendFileSync(path, `${canonical(2)}\n`);
    const chunk = await reader?.read();
    await reader?.cancel();
    expect(new TextDecoder().decode(chunk?.value)).toContain('id: evt_00000002');
  });
});

describe('corsFor', () => {
  it('reflects a localhost origin so the dev studio (cross-port) can read the data', () => {
    expect(corsFor('http://localhost:5173')).toEqual({
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    });
    expect(corsFor('http://127.0.0.1:4317')['Access-Control-Allow-Origin']).toBe('http://127.0.0.1:4317');
  });

  it('sends NO cors header for a foreign origin (a website cannot read the local data)', () => {
    expect(corsFor('https://evil.example.com')).toEqual({});
    expect(corsFor('https://localhost.evil.com')).toEqual({});
  });

  it('sends no cors header when there is no Origin (same-origin / curl)', () => {
    expect(corsFor(undefined)).toEqual({});
  });
});
