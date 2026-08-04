import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INSTALL_MANIFEST_PATH } from '../lib/install-manifest.js';
import { planHydrate, verificationLines } from './hydrate.js';

const manifest = (version: string) =>
  JSON.stringify({
    schemaVersion: 1,
    version,
    files: [{ path: '.claude/skills/tdd/SKILL.md', sha256: 'a'.repeat(64) }],
  });

describe('planHydrate', () => {
  it('hydrates when the running CLI is the version the project expects', () => {
    expect(planHydrate(manifest('2.5.1'), '2.5.1').kind).toBe('hydrate');
  });

  it('refuses a different version instead of substituting what is installed', () => {
    // Silently hydrating with another version is the exact drift this command
    // exists to make impossible.
    const plan = planHydrate(manifest('2.5.1'), '2.6.0');

    expect(plan.kind).toBe('version-mismatch');
    expect(plan.message).toContain('2.5.1');
    expect(plan.message).toContain('2.6.0');
  });

  it('hands back the exact command that selects the right version', () => {
    // npx already resolves versions; adding a fetch here would buy a network
    // surface and partial-failure modes for nothing.
    expect(planHydrate(manifest('2.5.1'), '2.6.0').fix).toBe('npx voidharness@2.5.1 hydrate');
  });

  it('says a project has never recorded what it expects, and how to record it', () => {
    const plan = planHydrate(undefined, '2.5.1');

    expect(plan.kind).toBe('no-manifest');
    expect(plan.message).toContain(INSTALL_MANIFEST_PATH);
    expect(plan.fix).toContain('init');
  });

  it('does not treat a corrupt manifest as an absent one', () => {
    // One means "never set up", the other "set up and damaged". Collapsing them
    // sends the reader to the wrong repair.
    const plan = planHydrate('{ not json', '2.5.1');

    expect(plan.kind).toBe('unreadable-manifest');
    expect(plan.fix).toContain('restore it from git');
  });
});

describe('the force remedy', () => {
  it('is what the source offers when a restore cannot be proven without it', () => {
    // The install transaction refuses to overwrite a file it no longer owns —
    // the right default. Restoring a hand-edited asset is deliberate, so the
    // failure names the deliberate flag instead of leaving the reader guessing.
    const source = readFileSync(new URL('./hydrate.ts', import.meta.url), 'utf8');

    expect(source).toContain("!args.includes('--force')");
    expect(source).toContain('edited by hand');
  });
});

describe('verificationLines', () => {
  const report = (over: Partial<Parameters<typeof verificationLines>[0]> = {}) =>
    verificationLines({
      ok: false,
      verified: 0,
      missing: [],
      missingTotal: 0,
      mismatched: [],
      mismatchedTotal: 0,
      ...over,
    });

  it('states the proof plainly when nothing drifted', () => {
    expect(report({ ok: true, verified: 126 })).toEqual(['126 file(s) restored and hash-verified']);
  });

  it('leads with differing bytes, which is the finding that matters most', () => {
    const lines = report({ mismatched: ['a.md'], mismatchedTotal: 1, missing: ['b.md'], missingTotal: 1 });

    expect(lines[0]).toContain('differ from the manifest');
    expect(lines.join('\n')).toContain('a.md');
    expect(lines.join('\n')).toContain('b.md');
  });

  it('counts the rest rather than printing a wall', () => {
    const lines = report({ missing: ['a.md'], missingTotal: 40 });

    expect(lines.join('\n')).toContain('… and 39 more');
  });
});
