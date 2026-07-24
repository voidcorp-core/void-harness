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
import { afterEach, describe, expect, it } from 'vitest';
import {
  hashSelfHostSource,
  syncSelfHost,
  type BuildHookBundle,
} from './compile.js';
import { readSelfHostReceipt } from './receipt.js';

const REPO = resolve(import.meta.dirname, '../../../../../..');
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
    const generatedRoot = await temporaryRoot('void-self-generated');
    const agentsBefore = await readFile(join(REPO, 'AGENTS.md'));

    const first = await syncSelfHost(REPO, {
      generatedRoot,
      buildHookBundle: copyCommittedRunner,
      mode: 'shadow',
    });
    const current = join(generatedRoot, 'current');
    const modifiedAt = (await lstat(current)).mtimeMs;
    const second = await syncSelfHost(REPO, {
      generatedRoot,
      buildHookBundle: copyCommittedRunner,
      mode: 'shadow',
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect((await lstat(current)).mtimeMs).toBe(modifiedAt);
    expect(await readFile(join(REPO, 'AGENTS.md'))).toEqual(agentsBefore);
    expect(await readSelfHostReceipt(current)).toMatchObject({ mode: 'shadow' });
  });

  it('restores the last green artifact when publication fails', async () => {
    const generatedRoot = await temporaryRoot('void-self-rollback');
    await syncSelfHost(REPO, {
      generatedRoot,
      buildHookBundle: copyCommittedRunner,
      mode: 'shadow',
    });

    await expect(syncSelfHost(REPO, {
      generatedRoot,
      buildHookBundle: copyCommittedRunner,
      mode: 'warn',
      failAfterBackup: true,
    })).rejects.toThrow('injected self-host publication failure');

    expect(await readSelfHostReceipt(join(generatedRoot, 'current')))
      .toMatchObject({ mode: 'shadow' });
  });
});
