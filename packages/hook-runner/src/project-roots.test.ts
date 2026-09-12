import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTelemetryRoot } from './project-roots.js';

function git(root: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`fixture git failed: ${result.stderr}`);
}

describe('telemetry destination evidence', () => {
  it('retains standalone project identity from nested working directories', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'void-event-roots-')));
    mkdirSync(join(root, '.void'));
    writeFileSync(join(root, '.void/config.json'), '{}');
    mkdirSync(join(root, 'nested'));
    expect(resolveTelemetryRoot(join(root, 'nested'))).toEqual({ kind: 'resolved', root });
  });

  it('refuses a broken Git pointer without declaring a local fallback successful', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'void-event-invalid-')));
    writeFileSync(join(root, '.git'), 'gitdir: missing\n');
    expect(resolveTelemetryRoot(root)).toMatchObject({ kind: 'unavailable', code: 'TELEMETRY_ROOT_UNRESOLVED' });
  });

  it('keeps an independent installation in its linked worktree', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'void-event-independent-')));
    git(root, 'init', '--quiet');
    writeFileSync(join(root, 'README.md'), '# root\n');
    git(root, 'add', 'README.md');
    git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'seed');
    const worker = join(root, 'worker');
    git(root, 'worktree', 'add', '-b', 'worker', worker);
    mkdirSync(join(worker, '.void/machine/receipts'), { recursive: true });
    writeFileSync(join(worker, '.void/machine/receipts/install-v1.json'), '{"schemaVersion":1}');
    expect(resolveTelemetryRoot(worker)).toEqual({ kind: 'resolved', root: worker });
  });
});
