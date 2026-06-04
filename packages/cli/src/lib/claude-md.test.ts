import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harnessBlock, patchClaudeMd, patchAgentsMd } from './claude-md.js';

const input = { enabledPlugins: ['void'], enabledPacks: [] as never[] };

describe('harnessBlock', () => {
  it('uses @imports for the Claude runtime', () => {
    const block = harnessBlock(input, 'claude');
    expect(block).toContain('@.void/PHILOSOPHY.md');
    expect(block).toContain('Claude Code doctrine active');
  });

  it('uses read-at-start file pointers (no @import) for the Codex runtime', () => {
    const block = harnessBlock(input, 'codex');
    expect(block).not.toContain('@.void/PHILOSOPHY.md');
    expect(block).toContain('`.void/PHILOSOPHY.md`');
    expect(block).toContain('Codex doctrine active');
    expect(block).toContain('read at the start');
  });
});

describe('patchClaudeMd / patchAgentsMd', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'void-cmd-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates CLAUDE.md and AGENTS.md when absent', async () => {
    expect(await patchClaudeMd(dir, input)).toBe('created');
    expect(await patchAgentsMd(dir, input)).toBe('created');
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toContain('# CLAUDE.md');
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('# AGENTS.md');
  });

  it('is idempotent on a second run (unchanged)', async () => {
    await patchAgentsMd(dir, input);
    expect(await patchAgentsMd(dir, input)).toBe('unchanged');
  });

  it('patches an existing AGENTS.md without clobbering user content', async () => {
    writeFileSync(join(dir, 'AGENTS.md'), '# AGENTS.md\n\n## My rules\nkeep me\n');
    expect(await patchAgentsMd(dir, input)).toBe('patched');
    const out = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    expect(out).toContain('keep me');
    expect(out).toContain('void-harness (managed');
  });
});
