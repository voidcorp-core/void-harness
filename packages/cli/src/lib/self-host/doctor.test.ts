import {
  cp,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  diagnoseSelfHost,
  selfHostChildEnvironment,
} from './doctor.js';
import {
  syncSelfHost,
  type BuildHookBundle,
} from './compile.js';

const REPO = resolve(import.meta.dirname, '../../../../..');
const roots: string[] = [];
const buildHookBundle: BuildHookBundle = async ({ outfile }) => {
  await cp(join(REPO, 'packages/core/hooks/_void-hook.mjs'), outfile);
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

async function generatedFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'void-self-doctor-'));
  roots.push(root);
  await syncSelfHost(REPO, {
    generatedRoot: root,
    buildHookBundle,
    mode: 'shadow',
  });
  return root;
}

describe('diagnoseSelfHost', () => {
  it('never forwards ambient credentials to runtime or hook probes', () => {
    const childEnvironment = selfHostChildEnvironment(
      {
        PATH: '/trusted/bin',
        LANG: 'fr_FR.UTF-8',
        HOME: '/Users/private',
        ANTHROPIC_API_KEY: 'secret-anthropic',
        OPENAI_API_KEY: 'secret-openai',
        NPM_TOKEN: 'secret-npm',
      },
      {
        VOID_PROJECT_ROOT: '/project',
      },
    );

    expect(childEnvironment).toEqual({
      PATH: '/trusted/bin',
      LANG: 'fr_FR.UTF-8',
      VOID_PROJECT_ROOT: '/project',
    });
  });

  it('keeps a valid artifact degraded when native runtimes are unavailable', async () => {
    const generatedRoot = await generatedFixture();
    const diagnosis = await diagnoseSelfHost(REPO, {
      generatedRoot,
      runtimeAvailable: () => false,
      probeEventReplay: async () => ({ ok: true, detail: 'canonical replay proven' }),
    });

    expect(diagnosis.state).toBe('degraded');
    expect(diagnosis.blocking).toBe(false);
    expect(diagnosis.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'receipt', status: 'ok' }),
      expect.objectContaining({ id: 'discovery', status: 'ok' }),
      expect.objectContaining({ id: 'event-replay', status: 'ok' }),
      expect.objectContaining({ id: 'runtime-claude', status: 'degraded' }),
      expect.objectContaining({ id: 'runtime-codex', status: 'degraded' }),
    ]));
  });

  it('distinguishes source staleness from owned-file drift', async () => {
    const generatedRoot = await generatedFixture();
    const stale = await diagnoseSelfHost(REPO, {
      generatedRoot,
      computeSourceHash: async () => 'f'.repeat(64),
      runtimeAvailable: () => false,
      probeEventReplay: async () => ({ ok: true, detail: 'ok' }),
    });
    expect(stale.state).toBe('stale');
    expect(stale.blocking).toBe(true);

    await writeFile(
      join(generatedRoot, 'current/.void/hooks/_void-hook.mjs'),
      'tampered',
    );
    const drifted = await diagnoseSelfHost(REPO, {
      generatedRoot,
      runtimeAvailable: () => false,
      probeEventReplay: async () => ({ ok: true, detail: 'ok' }),
    });
    expect(drifted.state).toBe('drifted');
    expect(drifted.blocking).toBe(true);
  });

  it('does not let a shadow receipt impersonate the release gate', async () => {
    const generatedRoot = await generatedFixture();
    const diagnosis = await diagnoseSelfHost(REPO, {
      generatedRoot,
      mode: 'release-gate',
      runtimeAvailable: () => false,
      probeEventReplay: async () => ({ ok: true, detail: 'ok' }),
    });
    expect(diagnosis.state).toBe('stale');
    expect(diagnosis.blocking).toBe(true);
  });

  it('fails closed on an unexpected file inside the owned artifact', async () => {
    const generatedRoot = await generatedFixture();
    await writeFile(join(generatedRoot, 'current', 'unexpected.txt'), 'injected');
    const diagnosis = await diagnoseSelfHost(REPO, {
      generatedRoot,
      runtimeAvailable: () => false,
      probeEventReplay: async () => ({ ok: true, detail: 'ok' }),
    });
    expect(diagnosis.state).toBe('drifted');
    expect(diagnosis.checks[0]?.detail).toContain('unexpected.txt');
  });
});
