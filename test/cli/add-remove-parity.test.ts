/**
 * Regression: `add` and `remove` must keep CLAUDE.md and AGENTS.md in parity.
 * Before the fix they patched only CLAUDE.md, leaving a stale AGENTS.md for Codex.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { add } from '../../packages/cli/src/commands/add.js';
import { remove } from '../../packages/cli/src/commands/remove.js';

let dir: string;
let cwd: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'void-addrm-'));
  cwd = process.cwd();
  process.chdir(dir);
});
afterEach(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

describe('add / remove keep the sister docs in parity', () => {
  it('add patches both CLAUDE.md and AGENTS.md', async () => {
    await add(['harness-nextjs']);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('harness-nextjs');
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toContain('harness-nextjs');
  });

  it('remove drops the pack from both docs', async () => {
    await add(['harness-nextjs']);
    await remove(['harness-nextjs']);
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).not.toContain('harness-nextjs');
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).not.toContain('harness-nextjs');
  });
});
