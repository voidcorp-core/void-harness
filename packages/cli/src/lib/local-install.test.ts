import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitFileTransaction } from './transaction.js';
import {
  buildInstallReceipt,
  encodeReceipt,
  INSTALL_RECEIPT_PATH,
} from './receipts.js';
import {
  prepareInstallCommit,
  seedInstallStage,
} from './local-install.js';

function scratch(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('local install staging', () => {
  it('seeds only shared files needed for non-destructive merges', async () => {
    const root = scratch('void-project-');
    const stage = scratch('void-stage-');
    mkdirSync(join(root, '.claude'), { recursive: true });
    mkdirSync(join(root, '.claude', 'skills', 'private'), { recursive: true });
    writeFileSync(join(root, '.claude', 'settings.json'), '{"user":true}\n');
    writeFileSync(join(root, 'CLAUDE.md'), '# user\n');
    writeFileSync(join(root, '.claude', 'skills', 'private', 'SKILL.md'), '# private\n');

    await seedInstallStage(root, stage);

    expect(readFileSync(join(stage, '.claude', 'settings.json'), 'utf8')).toBe('{"user":true}\n');
    expect(readFileSync(join(stage, 'CLAUDE.md'), 'utf8')).toBe('# user\n');
    expect(existsSync(join(stage, '.claude', 'skills', 'private', 'SKILL.md'))).toBe(false);
  });

  it('owns new managed files but never takes ownership of a pre-existing shared file', async () => {
    const root = scratch('void-project-');
    const stage = scratch('void-stage-');
    writeFileSync(join(root, 'CLAUDE.md'), '# user\n');
    mkdirSync(join(stage, '.void', 'hooks'), { recursive: true });
    writeFileSync(join(stage, '.void', 'hooks', 'guard.mjs'), 'guard\n');
    writeFileSync(join(stage, 'CLAUDE.md'), '# user\n\n<!-- void-harness -->\n');

    const prepared = await prepareInstallCommit({
      projectRoot: root,
      stageRoot: stage,
      version: '2.0.2',
      source: 'local',
      runtimes: ['claude'],
      force: false,
    });
    await commitFileTransaction(root, prepared.mutations);

    expect(prepared.receipt.files.map((file) => file.path)).toEqual(['.void/hooks/guard.mjs']);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toContain('void-harness');
    expect(existsSync(join(root, '.void', 'local', 'receipts', 'install-v1.json'))).toBe(true);
  });

  it('refuses to overwrite an unowned native asset unless force is explicit', async () => {
    const root = scratch('void-project-');
    const stage = scratch('void-stage-');
    mkdirSync(join(root, '.claude', 'skills', 'tdd'), { recursive: true });
    mkdirSync(join(stage, '.claude', 'skills', 'tdd'), { recursive: true });
    writeFileSync(join(root, '.claude', 'skills', 'tdd', 'SKILL.md'), '# user version\n');
    writeFileSync(join(stage, '.claude', 'skills', 'tdd', 'SKILL.md'), '# harness version\n');

    await expect(prepareInstallCommit({
      projectRoot: root,
      stageRoot: stage,
      version: '2.0.2',
      source: 'local',
      runtimes: ['claude'],
      force: false,
    })).rejects.toThrow(/unowned asset conflict/);
  });

  it('can add one runtime while retaining unchanged ownership from the other', async () => {
    const root = scratch('void-project-');
    const stage = scratch('void-stage-');
    const claudePath = '.claude/skills/tdd/SKILL.md';
    mkdirSync(join(root, '.claude', 'skills', 'tdd'), { recursive: true });
    mkdirSync(join(root, '.void', 'local', 'receipts'), { recursive: true });
    mkdirSync(join(stage, '.codex'), { recursive: true });
    writeFileSync(join(root, ...claudePath.split('/')), '# TDD\n');
    writeFileSync(join(stage, '.codex', 'hooks.json'), '{}\n');
    const prior = buildInstallReceipt({
      version: '2.0.2',
      source: 'local',
      runtimes: ['claude'],
      files: [{ path: claudePath, content: Buffer.from('# TDD\n'), mode: 0o644 }],
    });
    writeFileSync(join(root, ...INSTALL_RECEIPT_PATH.split('/')), encodeReceipt(prior));

    const prepared = await prepareInstallCommit({
      projectRoot: root,
      stageRoot: stage,
      version: '2.0.2',
      source: 'local',
      runtimes: ['claude', 'codex'],
      force: false,
      retainPreviousOwned: true,
    });

    expect(prepared.receipt.files.map((file) => file.path)).toEqual([
      '.claude/skills/tdd/SKILL.md',
      '.codex/hooks.json',
    ]);
    expect(prepared.mutations).not.toContainEqual({ path: claudePath, remove: true });
  });
});
