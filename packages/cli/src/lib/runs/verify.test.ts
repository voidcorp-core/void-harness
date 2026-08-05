import { execFileSync } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMission } from './store.js';
import { verifyMissionCommand } from './verify.js';

const roots: string[] = [];
const ID = 'mis_0123456789abcdef0123456789abcdef';

afterEach(async () => {
  delete process.env.VERIFY_TEST_TOKEN;
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true })
  ));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'void-mission-verify-'));
  roots.push(root);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  await writeFile(join(root, 'tracked.ts'), 'export const value = 1;\n');
  execFileSync('git', ['add', 'tracked.ts'], { cwd: root });
  await createMission(root, {
    missionId: ID,
    title: 'Verify command',
    mode: 'team',
  });
  return root;
}

describe('mission command verification', () => {
  it('runs argv without a shell and persists only redacted bounded evidence', async () => {
    const root = await repository();
    process.env.VERIFY_TEST_TOKEN = 'verify-top-secret-value';

    const result = await verifyMissionCommand({
      root,
      missionId: ID,
      command: [
        process.execPath,
        '-e',
        'process.stdout.write(process.env.VERIFY_TEST_TOKEN ?? "")',
      ],
      shell: false,
      echo: false,
    });
    const journal = await readFile(
      join(root, '.void', 'local', 'runs', ID, 'events.jsonl'),
      'utf8',
    );

    expect(result).toMatchObject({ exitCode: 0, verdict: 'verified' });
    expect(journal).not.toContain('verify-top-secret-value');
    expect(journal).toContain('[REDACTED]');
  });

  it('records spawn failures as blocking evidence instead of losing the run', async () => {
    const root = await repository();

    const result = await verifyMissionCommand({
      root,
      missionId: ID,
      command: ['void-command-that-does-not-exist'],
      shell: false,
      echo: false,
    });

    expect(result).toMatchObject({ exitCode: 127, verdict: 'blocked' });
  });
});
