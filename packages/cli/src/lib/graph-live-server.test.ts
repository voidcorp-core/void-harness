import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { corsFor, startLiveServer, type LiveServerOptions } from './graph-live-server.js';

const MODEL = JSON.stringify({ version: 1, nodes: [], edges: [] });

function logFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'void-live-'));
  const path = join(dir, 'activations.jsonl');
  writeFileSync(path, '');
  return path;
}

describe('graph live server', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server?.close(() => r()));
    server = undefined;
  });

  async function start(opts: Partial<LiveServerOptions>): Promise<number> {
    server = startLiveServer({ port: 0, logPath: logFile(), modelJson: MODEL, ...opts });
    await new Promise<void>((r) => server?.once('listening', () => r()));
    return (server.address() as AddressInfo).port;
  }

  it('serves the injected studio HTML at GET / with the right content-type', async () => {
    const port = await start({ studioHtml: '<!doctype html><title>studio</title>' });
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<title>studio</title>');
  });

  it('still serves /model.json alongside the studio', async () => {
    const port = await start({ studioHtml: '<html></html>' });
    const res = await fetch(`http://localhost:${port}/model.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.text()).toBe(MODEL);
    // A same-origin / non-browser request (no Origin) gets no CORS header — not a wildcard.
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns 404 on GET / when no studio is bundled (data-only server)', async () => {
    const port = await start({});
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('data-only');
  });

  it('serves the pre-computed studio data at GET /studio-data.json', async () => {
    const studioDataJson = JSON.stringify({ model: JSON.parse(MODEL), findings: [], usage: { counts: {}, usedSkillNames: [] }, workflows: {} });
    const port = await start({ studioDataJson });
    const res = await fetch(`http://localhost:${port}/studio-data.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.text()).toBe(studioDataJson);
  });

  it('returns 404 on /studio-data.json when data was not computed', async () => {
    const port = await start({});
    const res = await fetch(`http://localhost:${port}/studio-data.json`);
    expect(res.status).toBe(404);
  });

  it('walks to a free port when the requested one is busy', async () => {
    // Occupy an ephemeral port, then request exactly it: the server must bind a higher one.
    const busy = startLiveServer({ port: 0, logPath: logFile(), modelJson: MODEL });
    await new Promise<void>((r) => busy.once('listening', () => r()));
    const taken = (busy.address() as AddressInfo).port;
    try {
      let bound = 0;
      const server2 = startLiveServer({
        port: taken,
        logPath: logFile(),
        modelJson: MODEL,
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
});

describe('corsFor', () => {
  it('reflects a localhost origin so the dev studio (cross-port) can read the data', () => {
    expect(corsFor('http://localhost:5173')).toEqual({ 'Access-Control-Allow-Origin': 'http://localhost:5173', Vary: 'Origin' });
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
