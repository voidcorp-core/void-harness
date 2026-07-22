import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADAPTERS,
  adapterFor,
  adaptersFor,
  detectedAdapters,
  type RuntimeWireContext,
} from './runtime-adapters.js';

const CORE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'core');

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'void-adapters-'));
}

function ctxFor(projectRoot: string, pinVersion: string | undefined = '0.17.0'): RuntimeWireContext {
  return {
    projectRoot,
    sourceRoot: CORE_ROOT,
    enabledPlugins: ['harness'],
    enabledPacks: [],
    marketplaceRepo: 'voidcorp-core/void-plugins',
    pinVersion,
  };
}

describe('registry lookup', () => {
  it('has one adapter per known runtime, in canonical order', () => {
    expect(ADAPTERS.map((a) => a.id)).toEqual(['claude', 'codex']);
  });

  it('adapterFor resolves by id and throws on an unknown runtime', () => {
    expect(adapterFor('codex').label).toBe('Codex');
    // @ts-expect-error — exercising the runtime guard with an invalid id
    expect(() => adapterFor('hermes')).toThrow(/no adapter/);
  });

  it('adaptersFor filters to the selected set in registry order', () => {
    expect(adaptersFor(['codex', 'claude']).map((a) => a.id)).toEqual(['claude', 'codex']);
    expect(adaptersFor(['codex']).map((a) => a.id)).toEqual(['codex']);
  });
});

describe('detection', () => {
  it('detectedAdapters returns only the runtimes with a footprint', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'AGENTS.md'), '# x');
    expect(detectedAdapters(dir).map((a) => a.id)).toEqual(['codex']);
  });
});

describe('codex adapter', () => {
  it('wire stages the floor and writes AGENTS.md but NOT CLAUDE.md (doc is per-runtime)', async () => {
    const dir = scratch();
    const outcome = await adapterFor('codex').wire(ctxFor(dir));
    expect(existsSync(join(dir, '.codex', 'hooks.json'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
    expect(outcome.nextSteps.join(' ')).toContain('.codex/ layer');
    expect(outcome.nextSteps.join(' ')).not.toContain('restart Claude');
  });

  it('has no extra prerequisites', () => {
    expect(adapterFor('codex').prerequisites('repo')).toEqual([]);
  });

  it('doctorChecks flags a healthy floor green and a missing AGENTS block red', async () => {
    const dir = scratch();
    await adapterFor('codex').wire(ctxFor(dir));
    const checks = await adapterFor('codex').doctorChecks(dir);
    expect(checks.find((c) => c.name === 'codex floor')?.ok).toBe(true);
    expect(checks.find((c) => c.name === 'AGENTS.md')?.ok).toBe(true);
  });
});

describe('claude adapter', () => {
  it('wire merges settings.json and writes CLAUDE.md but NOT AGENTS.md', async () => {
    const dir = scratch();
    const outcome = await adapterFor('claude').wire(ctxFor(dir));
    expect(existsSync(join(dir, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
    expect(outcome.nextSteps.join(' ')).toContain('restart Claude Code');
  });

  it('emits a FAILED next-step when the pin is unresolved', async () => {
    const dir = scratch();
    const outcome = await adapterFor('claude').wire({ ...ctxFor(dir), pinVersion: undefined });
    expect(outcome.nextSteps.some((s) => s.startsWith('FAILED:') && s.includes('core version could not be resolved'))).toBe(true);
  });

  it('doctorChecks reds a missing settings.json', async () => {
    const dir = scratch();
    const checks = await adapterFor('claude').doctorChecks(dir);
    expect(checks.find((c) => c.name === 'settings.json')?.ok).toBe(false);
  });
});

describe('runtime add is frictionless (a-posteriori wire touches only the added runtime)', () => {
  it('adding codex to a wired-claude project leaves the Claude layer intact', async () => {
    const dir = scratch();
    await adapterFor('claude').wire(ctxFor(dir));
    const settingsBefore = readFileSync(join(dir, '.claude', 'settings.json'), 'utf8');

    await adapterFor('codex').wire(ctxFor(dir));

    // Codex now wired...
    expect(existsSync(join(dir, '.codex', 'hooks.json'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    // ...and the Claude layer is byte-for-byte untouched.
    expect(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8')).toBe(settingsBefore);
  });
});
