/**
 * An unreadable `.claude/settings.json` is not an empty one.
 *
 * `readSettings` answered `{}` to a parse error, so the caller merged into
 * nothing and wrote the result: a trailing comma -- the most ordinary way a
 * settings file breaks -- cost the project its hooks, its permissions and its
 * environment. No `--force` was needed, and nothing was said before or after
 * (DEV-664).
 *
 * `.void/config.json` already answers this properly through `configWriteVerdict`:
 * readable merges, unreadable is left alone and named, `--force` overwrites and
 * says so first. This holds `settings.json` to the same contract, against a real
 * file on disk rather than an object in memory -- the defect lived in the read,
 * so a test that hands the merge an object would prove nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from '../../packages/cli/src/commands/init.js';

let dir: string;
let cwd: string;
let output: string;

const BROKEN = `{
  "hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [] }] },
  "permissions": { "allow": ["Bash(ls:*)"] },
}
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'void-settings-'));
  cwd = process.cwd();
  output = '';
  process.chdir(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array): boolean => {
    output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  });
  // So the runner survives the refusal and can read the file afterwards, the
  // same treatment `doctor.test.ts` gives it.
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${String(code ?? 0)})`);
  }) as never);
});
afterEach(() => {
  process.chdir(cwd);
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const settingsPath = (): string => join(dir, '.claude', 'settings.json');
const settings = (): string => readFileSync(settingsPath(), 'utf8');

function writeSettings(content: string): void {
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(settingsPath(), content);
}

describe('an unreadable settings file survives an install', () => {
  it('leaves the bytes exactly as the project wrote them', async () => {
    writeSettings(BROKEN);

    await expect(init(['--runtime', 'claude', '--no-interactive'])).rejects.toThrow();

    expect(settings()).toBe(BROKEN);
  });

  // Refused rather than half-wired: every hook is declared in this file, so an
  // install that skipped it and reported success would ship a harness with no
  // enforcement floor at all.
  it('names the file and both remedies rather than a generic failure', async () => {
    writeSettings(BROKEN);

    await expect(init(['--runtime', 'claude', '--no-interactive'])).rejects.toThrow();

    expect(output).toMatch(/\.claude\/settings\.json/);
    expect(output).toMatch(/could not be parsed/i);
    expect(output).toMatch(/--force/);
  });

  it('replaces the file when --force says to, and says that it did', async () => {
    writeSettings(BROKEN);

    await init(['--runtime', 'claude', '--no-interactive', '--force']);

    expect(JSON.parse(settings())).toHaveProperty('hooks');
    expect(output).toMatch(/replaced/i);
  });

  // The control on the other side. A guard that refuses every install is not a
  // guard, and the two ordinary cases are the ones nobody would notice breaking.
  it('still creates the file when the project has none', async () => {
    await init(['--runtime', 'claude', '--no-interactive']);

    expect(JSON.parse(settings())).toHaveProperty('hooks');
    expect(output).not.toMatch(/could not be parsed/i);
  });

  it('still merges into a readable file, keeping what the project put there', async () => {
    writeSettings(`{ "permissions": { "allow": ["Bash(ls:*)"] } }\n`);

    await init(['--runtime', 'claude', '--no-interactive']);

    const merged: unknown = JSON.parse(settings());
    expect(merged).toHaveProperty('hooks');
    expect((merged as { permissions?: { allow?: string[] } }).permissions?.allow).toEqual(['Bash(ls:*)']);
  });
});
