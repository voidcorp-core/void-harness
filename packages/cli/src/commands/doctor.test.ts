import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `doctor` is a command with side effects and a process exit, so it is exercised
// the way a user meets it: as a binary, in a throwaway project. The behaviour
// worth pinning is the one that cost an hour on 2026-08-18, when a 2.5.1 binary
// told a healthy 2.7.0 project that its doctrine was missing, its hooks never
// fired and five packs were unwired. Four failures, none real, each with a
// remedy that would have damaged a correct install.
const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'void-harness.mjs');

function projectRecording(version: string): string {
  const root = mkdtempSync(join(tmpdir(), 'doctor-cmd-'));
  mkdirSync(join(root, '.void'), { recursive: true });
  writeFileSync(
    join(root, '.void', 'install-manifest.json'),
    JSON.stringify({ schemaVersion: 1, version, files: [] }),
  );
  writeFileSync(join(root, '.void', 'config.json'), '{}');
  return root;
}

function runDoctor(root: string): { code: number; out: string } {
  const result = spawnSync(process.execPath, [CLI, 'doctor', '--no-remote'], {
    cwd: root,
    encoding: 'utf8',
  });
  return { code: result.status ?? 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('doctor and a runner older than the project', () => {
  it('reports the version gap and judges nothing else', () => {
    // A version no release will ever reach, so this stays true as the CLI moves.
    const { code, out } = runDoctor(projectRecording('99.0.0'));
    expect(code).toBe(1);
    expect(out).toContain('99.0.0');
    expect(out).toMatch(/structure/i);
    // The checks it declined to run must not appear at all: reporting them from
    // the previous layout is exactly the damage being prevented.
    expect(out).not.toMatch(/doctrine files/);
    expect(out).not.toMatch(/packs coherence/);
  });

  // A newer CLI meeting an older project is the ordinary state between a publish
  // and that project's `update`. Suspending there would refuse every healthy
  // project in the days after a release.
  it('says nothing about the gap when the project is the older one', () => {
    const { out } = runDoctor(projectRecording('0.0.1'));
    expect(out).not.toMatch(/structure checks\s+suspended/);
  });
});
