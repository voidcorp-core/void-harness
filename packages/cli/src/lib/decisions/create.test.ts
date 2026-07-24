import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDecision, detectDecisionsDirectory, slugifyDecision } from './create.js';

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'void-decisions-'));
}

describe('detectDecisionsDirectory', () => {
  it('preserves the harness legacy directory when it exists', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'docs', 'decisions-log'), { recursive: true });

    expect(await detectDecisionsDirectory(root)).toBe(join(root, 'docs', 'decisions-log'));
  });

  it('defaults new projects to docs/decisions', async () => {
    const root = await tempRoot();

    expect(await detectDecisionsDirectory(root)).toBe(join(root, 'docs', 'decisions'));
  });
});

describe('slugifyDecision', () => {
  it('normalizes user input to one safe filename segment', () => {
    expect(slugifyDecision('../../Décision  Très IMPORTANTE!')).toBe(
      'decision-tres-importante',
    );
  });
});

describe('createDecision', () => {
  it('creates concurrent ADRs without touching a shared index', async () => {
    const root = await tempRoot();
    const legacyIndex = join(root, 'docs', 'DECISIONS.md');
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(legacyIndex, 'frozen legacy snapshot\n', 'utf8');

    const created = await Promise.all(
      Array.from({ length: 32 }, (_, index) =>
        createDecision(root, {
          title: `Concurrent decision ${index}`,
          slug: 'parallel-choice',
          now: new Date('2026-07-24T10:15:00.000Z'),
        }),
      ),
    );

    expect(new Set(created.map((entry) => entry.id))).toHaveLength(32);
    expect(new Set(created.map((entry) => entry.path))).toHaveLength(32);
    expect(await readdir(join(root, 'docs', 'decisions'))).toHaveLength(32);
    expect(await readFile(legacyIndex, 'utf8')).toBe('frozen legacy snapshot\n');
  });

  it('retries an exclusive-create collision with a fresh id', async () => {
    const root = await tempRoot();
    const ids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    const first = await createDecision(
      root,
      {
        title: 'First',
        slug: 'same',
        now: new Date('2026-07-24T10:15:00.000Z'),
      },
      { randomUUID: () => ids.shift() ?? 'unexpected' },
    );
    const second = await createDecision(
      root,
      {
        title: 'Second',
        slug: 'same',
        now: new Date('2026-07-24T10:15:00.000Z'),
      },
      { randomUUID: () => ids.shift() ?? 'unexpected' },
    );

    expect(first.id).toBe('adr:00000000-0000-4000-8000-000000000001');
    expect(second.id).toBe('adr:00000000-0000-4000-8000-000000000002');
  });

  it('rejects an existing decisions directory that escapes through a symlink', async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    await mkdir(join(root, 'docs'), { recursive: true });
    await symlink(outside, join(root, 'docs', 'decisions'));

    await expect(
      createDecision(root, {
        title: 'Escaping decision',
        slug: 'escape',
        now: new Date('2026-07-24T10:15:00.000Z'),
      }),
    ).rejects.toThrow('DECISIONS_PATH_ESCAPE');
    expect(await readdir(outside)).toEqual([]);
  });

  it('rejects an escaping parent symlink before creating the decisions directory', async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    await symlink(outside, join(root, 'docs'));

    await expect(
      createDecision(root, {
        title: 'Escaping through docs',
        slug: 'escape-parent',
        now: new Date('2026-07-24T10:15:00.000Z'),
      }),
    ).rejects.toThrow('DECISIONS_PATH_ESCAPE');
    expect(await readdir(outside)).toEqual([]);
  });
});
