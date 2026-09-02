import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  hashSelfHostSource,
  syncSelfHost,
  type BuildHookBundle,
  type SelfHostSyncResult,
} from './compile.js';
import { readSelfHostReceipt } from './receipt.js';
import { wireSelfHostRuntimeSurfaces } from './wire.js';

const REPO = resolve(import.meta.dirname, '../../../../..');
const roots: string[] = [];

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

const copyCommittedRunner: BuildHookBundle = async ({ outfile }) => {
  await cp(join(REPO, 'packages/core/hooks/_void-hook.mjs'), outfile);
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

/**
 * One real compilation for the whole file, and every test works on a copy of it.
 *
 * These tests call `syncSelfHost` on the real repository, which is the point:
 * the proof is worth having only if it compiles the actual sources. What was
 * not worth having is compiling them five times. Measured on an idle machine:
 * one `syncSelfHost` costs about 900 ms -- roughly 830 ms of compilation and
 * 175 ms per source hash, taken twice -- while copying the 1.5 MB artifact it
 * produces costs about 110 ms. Under a full concurrent suite every one of those
 * numbers roughly tripled, and the two tests that chained two syncs each landed
 * a few dozen milliseconds past the 10 s budget: a verdict decided by machine
 * load rather than by the code.
 *
 * The template is built once, before any test, and never written to. Each test
 * copies it into a root of its own, so nothing here depends on which test ran
 * first -- replacing a load flake with an ordering flake would be no bargain.
 *
 * This hook is the one place deliberately allowed to be slow, with a budget
 * stated here rather than in a config: it is the file's single proof that the
 * real compilation path works, and no assertion of its own depends on how long
 * it takes.
 */
let greenArtifact: string;
let firstSync: SelfHostSyncResult;

beforeAll(async () => {
  greenArtifact = await mkdtemp(join(tmpdir(), 'void-self-template-'));
  firstSync = await syncSelfHost(REPO, {
    generatedRoot: greenArtifact,
    buildHookBundle: copyCommittedRunner,
    wireRuntimeSurfaces: wireSelfHostRuntimeSurfaces,
    mode: 'shadow',
  });
}, 60_000);

afterAll(async () => {
  await rm(greenArtifact, { recursive: true, force: true });
});

/** A private copy of the green artifact, cleaned up with the others. */
async function greenRoot(name: string): Promise<string> {
  const root = await temporaryRoot(name);
  await cp(greenArtifact, root, { recursive: true });
  return root;
}

describe('hashSelfHostSource', () => {
  it('changes when a current source input changes', async () => {
    const root = await temporaryRoot('void-self-source');
    const inputs = [
      'packages/core/skills/tdd/SKILL.md',
      'packages/cli/src/lib/runtime-assets.ts',
      'packages/hook-runner/src/cli.ts',
      'packages/mission-engine/src/index.ts',
      'package.json',
      'pnpm-lock.yaml',
    ];
    for (const input of inputs) {
      await mkdir(join(root, input, '..'), { recursive: true });
      await writeFile(join(root, input), `${input}\n`);
    }
    const before = await hashSelfHostSource(root);
    const skill = join(root, 'packages/core/skills/tdd/SKILL.md');
    const current = await readFile(skill, 'utf8');
    await writeFile(skill, `${current}\nsource drift\n`);
    expect(await hashSelfHostSource(root)).not.toBe(before);
  });
});

describe('syncSelfHost', () => {
  it('is idempotent and never changes native repository files', async () => {
    // The source hash stays real here: re-hashing the repository and finding the
    // same value is what idempotence MEANS, and it is the cheap half anyway. The
    // template's own hash was computed by a separate call in `beforeAll`, so the
    // two readings compared below are genuinely two readings.
    const generatedRoot = await greenRoot('void-self-generated');
    const agentsBefore = await readFile(join(REPO, 'AGENTS.md'));
    const current = join(generatedRoot, 'current');
    const modifiedAt = (await lstat(current)).mtimeMs;

    const second = await syncSelfHost(REPO, {
      generatedRoot,
      buildHookBundle: copyCommittedRunner,
      wireRuntimeSurfaces: wireSelfHostRuntimeSurfaces,
      mode: 'shadow',
    });

    expect(firstSync.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.sourceHash).toBe(firstSync.sourceHash);
    expect((await lstat(current)).mtimeMs).toBe(modifiedAt);
    expect(await readFile(join(REPO, 'AGENTS.md'))).toEqual(agentsBefore);
    expect(await readSelfHostReceipt(current)).toMatchObject({ mode: 'shadow' });
  });

  it('restores the last green artifact when publication fails', async () => {
    // The last green artifact is the template, published in `shadow`. The failing
    // attempt runs in `warn`, so it never takes the up-to-date short circuit and
    // reaches publication whatever the hash says -- which is why the hash can be
    // injected here without weakening anything the assertions below read.
    const generatedRoot = await greenRoot('void-self-rollback');

    await expect(syncSelfHost(REPO, {
      computeSourceHash: async () => 'b'.repeat(64),
      generatedRoot,
      buildHookBundle: copyCommittedRunner,
      wireRuntimeSurfaces: wireSelfHostRuntimeSurfaces,
      mode: 'warn',
      failAfterBackup: true,
    })).rejects.toThrow('injected self-host publication failure');

    expect(await readSelfHostReceipt(join(generatedRoot, 'current')))
      .toMatchObject({ mode: 'shadow' });
  });

  it('refuses to publish when sources change during compilation', async () => {
    const generatedRoot = await temporaryRoot('void-self-concurrent');
    let hashCalls = 0;

    await expect(syncSelfHost(REPO, {
      generatedRoot,
      buildHookBundle: copyCommittedRunner,
      wireRuntimeSurfaces: wireSelfHostRuntimeSurfaces,
      computeSourceHash: async () => {
        hashCalls += 1;
        return (hashCalls === 1 ? 'a' : 'b').repeat(64);
      },
      mode: 'shadow',
    })).rejects.toThrow('self-host sources changed during compilation');

    expect(await lstat(join(generatedRoot, 'current')).catch(() => undefined))
      .toBeUndefined();
  });
});
