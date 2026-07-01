import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { startLiveServer, type LiveServerOptions } from './graph-live-server.js';

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
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
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
});
