import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
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
    const nested = join(worker, 'app');
    mkdirSync(join(nested, '.void'), { recursive: true });
    writeFileSync(join(nested, '.void/config.json'), '{}');
    vi.stubEnv('PATH', '');
    try {
      expect(resolveTelemetryRoot(nested)).toEqual({ kind: 'resolved', root });
    } finally {
      vi.unstubAllEnvs();
    }
    mkdirSync(join(root, 'app/.void'), { recursive: true });
    writeFileSync(join(root, 'app/.void/config.json'), '{}');
    expect(resolveTelemetryRoot(join(root, 'app'))).toEqual({ kind: 'resolved', root });
    mkdirSync(join(worker, '.void/machine/receipts'), { recursive: true });
    writeFileSync(join(worker, '.void/machine/receipts/install-v1.json'), '{"schemaVersion":1}');
    expect(resolveTelemetryRoot(worker)).toEqual({ kind: 'resolved', root: worker });
    expect(resolveTelemetryRoot(nested)).toEqual({ kind: 'resolved', root: worker });
    mkdirSync(join(nested, '.void/machine/receipts'), { recursive: true });
    writeFileSync(join(nested, '.void/machine/receipts/install-v1.json'), '{"schemaVersion":1}');
    expect(resolveTelemetryRoot(nested)).toEqual({ kind: 'resolved', root: nested });
  });

  it('refuses an exhausted discovery deadline without a successful local fallback', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'void-event-deadline-')));
    git(root, 'init', '--quiet', '--separate-git-dir', join(root, 'metadata'));
    git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.test',
      'commit', '--allow-empty', '-qm', 'seed');
    expect(resolveTelemetryRoot(root)).toEqual({ kind: 'resolved', root });
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(101);
    try {
      expect(resolveTelemetryRoot(root)).toEqual({
        kind: 'unavailable', code: 'TELEMETRY_ROOT_UNRESOLVED',
      });
    } finally {
      clock.mockRestore();
    }
  });

  it('refuses a pointer borrowed from another worker despite a shared common directory', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'void-event-backlink-')));
    git(root, 'init', '--quiet');
    git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.test',
      'commit', '--allow-empty', '-qm', 'seed');
    const first = join(root, 'first');
    const second = join(root, 'second');
    git(root, 'worktree', 'add', '-b', 'first', first);
    git(root, 'worktree', 'add', '-b', 'second', second);
    writeFileSync(join(first, '.git'), readFileSync(join(second, '.git')));
    expect(resolveTelemetryRoot(first)).toEqual({
      kind: 'unavailable', code: 'TELEMETRY_ROOT_UNRESOLVED',
    });
  });

  it.each(['gitdir: ', 'gitdir: bad\npath', `gitdir: ${'x'.repeat(4097)}`])(
    'refuses malformed or oversized identity metadata: %s', (pointer) => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'void-event-pointer-')));
      writeFileSync(join(root, '.git'), pointer);
      expect(resolveTelemetryRoot(root)).toMatchObject({ kind: 'unavailable' });
    },
  );
});
