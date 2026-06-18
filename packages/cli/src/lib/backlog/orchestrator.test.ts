import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runIteration } from './orchestrator.js';

// A fake `claude` (run via node) that records the API key it received, then
// replays a recorded stream-json capture to stdout. Lets us exercise the real
// spawn → parse → render → classify path without a live model call.
const FAKE = `
import { readFileSync, writeFileSync } from 'node:fs';
writeFileSync(process.env.SENTINEL, process.env.ANTHROPIC_API_KEY ?? 'UNSET');
process.stdout.write(readFileSync(process.env.FAKE_STREAM, 'utf8'));
`;

const fixturePath = fileURLToPath(new URL('./fixtures/iteration.stream.jsonl', import.meta.url));

let dir: string;
let fakeClaude: string;
let sentinel: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bl-orch-'));
  fakeClaude = join(dir, 'fake-claude.mjs');
  sentinel = join(dir, 'apikey.txt');
  writeFileSync(fakeClaude, FAKE);
});

afterAll(() => {
  // tmp dir is left for the OS to reap; nothing sensitive written.
});

describe('runIteration against a fake claude', () => {
  it('classifies the completed result and collects events', async () => {
    const lines: string[] = [];
    const result = await runIteration({
      command: process.execPath,
      claudeArgs: [fakeClaude],
      prompt: 'work one ticket',
      cwd: dir,
      env: { SENTINEL: sentinel, FAKE_STREAM: fixturePath, ANTHROPIC_API_KEY: 'sk-should-be-stripped' },
      allowApi: false,
      stream: true,
      write: (l) => lines.push(l),
    });

    expect(result.status).toBe('completed');
    expect(result.ticket).toBe('DEV-42');
    expect(result.events.length).toBeGreaterThan(5);

    const flux = lines.join('\n');
    expect(flux).toContain('session');
    expect(flux).toContain('plan');
    expect(flux).toContain('completed');
  });

  it('strips ANTHROPIC_API_KEY from the worker env', async () => {
    await runIteration({
      command: process.execPath,
      claudeArgs: [fakeClaude],
      prompt: 'x',
      cwd: dir,
      env: { SENTINEL: sentinel, FAKE_STREAM: fixturePath, ANTHROPIC_API_KEY: 'sk-leak' },
      allowApi: false,
      stream: false,
      write: () => {},
    });
    expect(readFileSync(sentinel, 'utf8')).toBe('UNSET');
  });

  it('keeps the API key when allowApi is true', async () => {
    await runIteration({
      command: process.execPath,
      claudeArgs: [fakeClaude],
      prompt: 'x',
      cwd: dir,
      env: { SENTINEL: sentinel, FAKE_STREAM: fixturePath, ANTHROPIC_API_KEY: 'sk-allowed' },
      allowApi: true,
      stream: false,
      write: () => {},
    });
    expect(readFileSync(sentinel, 'utf8')).toBe('sk-allowed');
  });

  it('returns failed when the worker emits no result marker', async () => {
    const emptyStream = join(dir, 'empty.jsonl');
    writeFileSync(emptyStream, '{"type":"system","subtype":"init","model":"x"}\n');
    const result = await runIteration({
      command: process.execPath,
      claudeArgs: [fakeClaude],
      prompt: 'x',
      cwd: dir,
      env: { SENTINEL: sentinel, FAKE_STREAM: emptyStream },
      allowApi: false,
      stream: false,
      write: () => {},
    });
    expect(result.status).toBe('failed');
  });
});
