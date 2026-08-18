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
import {
  buildInstallManifest,
  INSTALL_MANIFEST_PATH,
  sha256Of,
} from './install-manifest.js';
import {
  prepareInstallCommit,
  seedInstallStage,
} from './local-install.js';
import {
  buildInstallReceipt,
  encodeReceipt,
  INSTALL_RECEIPT_PATH,
} from './receipts.js';
import { commitFileTransaction } from './transaction.js';

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
    expect(existsSync(join(root, '.void', 'machine', 'receipts', 'install-v1.json'))).toBe(true);
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

  it('does not trust a manifest the active receipt does not own', async () => {
    const root = scratch('void-project-');
    const stage = scratch('void-stage-');
    const skillPath = '.claude/skills/tdd/SKILL.md';
    mkdirSync(join(root, '.claude', 'skills', 'tdd'), { recursive: true });
    mkdirSync(join(root, '.void', 'machine', 'receipts'), { recursive: true });
    mkdirSync(join(stage, '.claude', 'skills', 'tdd'), { recursive: true });
    writeFileSync(join(root, ...skillPath.split('/')), '# user version\n');
    writeFileSync(join(stage, ...skillPath.split('/')), '# harness version\n');
    const manifest = buildInstallManifest('3.0.0', [{
      path: skillPath,
      sha256: sha256Of('# user version\n'),
    }]);
    writeFileSync(join(root, ...INSTALL_MANIFEST_PATH.split('/')), `${JSON.stringify(manifest)}\n`);
    const receipt = buildInstallReceipt({
      version: '3.0.0',
      source: 'local',
      runtimes: ['claude'],
      files: [],
    });
    writeFileSync(join(root, ...INSTALL_RECEIPT_PATH.split('/')), encodeReceipt(receipt));

    await expect(prepareInstallCommit({
      projectRoot: root,
      stageRoot: stage,
      version: '3.0.1',
      source: 'local',
      runtimes: ['claude'],
      force: false,
    })).rejects.toThrow(/unowned asset conflict/);
  });

  it('does not let a historical proof override an active receipt entry', async () => {
    const root = scratch('void-project-');
    const stage = scratch('void-stage-');
    const agentPath = '.claude/agents/example.md';
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
    mkdirSync(join(root, '.void', 'machine', 'receipts'), { recursive: true });
    mkdirSync(join(stage, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(root, ...agentPath.split('/')), '# restored v2 locally\n');
    writeFileSync(join(stage, ...agentPath.split('/')), '# harness v4\n');
    const active = buildInstallReceipt({
      version: '3.0.0',
      source: 'local',
      runtimes: ['claude'],
      files: [{ path: agentPath, content: Buffer.from('# harness v3\n'), mode: 0o644 }],
    });
    const historical = buildInstallReceipt({
      version: '2.7.0',
      source: 'local',
      runtimes: ['claude'],
      files: [{ path: agentPath, content: Buffer.from('# restored v2 locally\n'), mode: 0o644 }],
    });
    writeFileSync(join(root, ...INSTALL_RECEIPT_PATH.split('/')), encodeReceipt(active));
    writeFileSync(
      join(root, ...`${INSTALL_RECEIPT_PATH}.legacy`.split('/')),
      encodeReceipt(historical),
    );

    await expect(prepareInstallCommit({
      projectRoot: root,
      stageRoot: stage,
      version: '3.0.1',
      source: 'local',
      runtimes: ['claude'],
      force: false,
    })).rejects.toThrow(/unowned asset conflict/);
  });

  it('preserves a stale local file that only matches a superseded receipt', async () => {
    const root = scratch('void-project-');
    const stage = scratch('void-stage-');
    const retiredPath = '.claude/skills/retired/SKILL.md';
    mkdirSync(join(root, '.claude', 'skills', 'retired'), { recursive: true });
    mkdirSync(join(root, '.void', 'machine', 'receipts'), { recursive: true });
    writeFileSync(join(root, ...retiredPath.split('/')), '# restored v2 locally\n');
    const active = buildInstallReceipt({
      version: '3.0.0',
      source: 'local',
      runtimes: ['claude'],
      files: [{ path: retiredPath, content: Buffer.from('# harness v3\n'), mode: 0o644 }],
    });
    const historical = buildInstallReceipt({
      version: '2.7.0',
      source: 'local',
      runtimes: ['claude'],
      files: [{ path: retiredPath, content: Buffer.from('# restored v2 locally\n'), mode: 0o644 }],
    });
    writeFileSync(join(root, ...INSTALL_RECEIPT_PATH.split('/')), encodeReceipt(active));
    writeFileSync(
      join(root, ...`${INSTALL_RECEIPT_PATH}.legacy`.split('/')),
      encodeReceipt(historical),
    );

    const prepared = await prepareInstallCommit({
      projectRoot: root,
      stageRoot: stage,
      version: '3.0.1',
      source: 'local',
      runtimes: ['claude'],
      force: false,
    });

    expect(prepared.preserved).toContain(retiredPath);
    expect(prepared.mutations).not.toContainEqual({ path: retiredPath, remove: true });
  });

  it('can add one runtime while retaining unchanged ownership from the other', async () => {
    const root = scratch('void-project-');
    const stage = scratch('void-stage-');
    const claudePath = '.claude/skills/tdd/SKILL.md';
    mkdirSync(join(root, '.claude', 'skills', 'tdd'), { recursive: true });
    mkdirSync(join(root, '.void', 'machine', 'receipts'), { recursive: true });
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

  it('recovers exact managed ownership from a parked receipt during update', async () => {
    const root = scratch('void-project-');
    const stage = scratch('void-stage-');
    const changedPath = '.claude/agents/migration-planner.md';
    const manifestRecoveredPath = '.claude/agents/solution-architect.md';
    const retiredPath = '.claude/skills/ticket-runner/SKILL.md';
    const editedPath = '.claude/skills/writing-plans/SKILL.md';
    const sharedPath = '.void/config.json';
    mkdirSync(join(root, '.void', 'machine', 'receipts'), { recursive: true });
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
    mkdirSync(join(root, '.claude', 'skills', 'ticket-runner'), { recursive: true });
    mkdirSync(join(root, '.claude', 'skills', 'writing-plans'), { recursive: true });
    mkdirSync(join(stage, '.claude', 'agents'), { recursive: true });
    mkdirSync(join(stage, '.void'), { recursive: true });
    writeFileSync(join(root, ...changedPath.split('/')), '# migration planner v2\n');
    writeFileSync(join(root, ...manifestRecoveredPath.split('/')), '# solution architect v3\n');
    writeFileSync(join(root, ...retiredPath.split('/')), '# ticket runner v2\n');
    writeFileSync(join(root, ...editedPath.split('/')), '# locally edited plan\n');
    writeFileSync(join(root, ...sharedPath.split('/')), '{"project":true}\n');
    writeFileSync(join(stage, ...changedPath.split('/')), '# migration planner v3\n');
    writeFileSync(join(stage, ...manifestRecoveredPath.split('/')), '# solution architect v3.0.1\n');
    writeFileSync(join(stage, ...INSTALL_MANIFEST_PATH.split('/')), '{"version":"3.0.1"}\n');

    const manifest = buildInstallManifest('3.0.0', [{
      path: manifestRecoveredPath,
      sha256: sha256Of('# solution architect v3\n'),
    }]);
    const manifestBody = `${JSON.stringify(manifest)}\n`;
    const active = buildInstallReceipt({
      version: '3.0.0',
      source: 'local',
      runtimes: ['claude'],
      files: [{ path: INSTALL_MANIFEST_PATH, content: Buffer.from(manifestBody), mode: 0o644 }],
    });
    const parked = buildInstallReceipt({
      version: '2.5.1',
      source: 'local',
      runtimes: ['claude'],
      files: [
        { path: changedPath, content: Buffer.from('# migration planner v2\n'), mode: 0o644 },
        { path: retiredPath, content: Buffer.from('# ticket runner v2\n'), mode: 0o644 },
        { path: editedPath, content: Buffer.from('# writing plans v2\n'), mode: 0o644 },
        { path: sharedPath, content: Buffer.from('{"project":true}\n'), mode: 0o644 },
      ],
    });
    writeFileSync(join(root, ...INSTALL_RECEIPT_PATH.split('/')), encodeReceipt(active));
    writeFileSync(join(root, ...`${INSTALL_RECEIPT_PATH}.legacy`.split('/')), encodeReceipt(parked));
    writeFileSync(join(root, ...INSTALL_MANIFEST_PATH.split('/')), manifestBody);

    const prepared = await prepareInstallCommit({
      projectRoot: root,
      stageRoot: stage,
      version: '3.0.1',
      source: 'local',
      runtimes: ['claude'],
      force: false,
    });

    expect(prepared.mutations).toContainEqual({
      path: changedPath,
      content: expect.any(Uint8Array),
      mode: 0o644,
    });
    expect(prepared.mutations).toContainEqual({ path: retiredPath, remove: true });
    expect(prepared.mutations).toContainEqual({
      path: manifestRecoveredPath,
      content: expect.any(Uint8Array),
      mode: 0o644,
    });
    expect(prepared.mutations).not.toContainEqual({ path: sharedPath, remove: true });
    expect(prepared.preserved).toContain(editedPath);
    expect(prepared.receipt.files.map((file) => file.path)).toEqual([
      changedPath,
      manifestRecoveredPath,
      INSTALL_MANIFEST_PATH,
    ]);
  });
});
