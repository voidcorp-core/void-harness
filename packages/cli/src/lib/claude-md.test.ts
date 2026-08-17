import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { harnessBlock, patchClaudeMd, patchAgentsMd, patchExistingRuntimeDocs } from './claude-md.js';

const input = { enabledPlugins: ['harness'], enabledPacks: [] as never[] };

describe('harnessBlock', () => {
  it('uses @imports for the Claude runtime', () => {
    const block = harnessBlock(input, 'claude');
    expect(block).toContain('@.void/installed/PHILOSOPHY.md');
    expect(block).toContain('Claude Code doctrine active');
  });

  it('uses read-at-start file pointers (no @import) for the Codex runtime', () => {
    const block = harnessBlock(input, 'codex');
    expect(block).not.toContain('@.void/installed/PHILOSOPHY.md');
    expect(block).toContain('`.void/installed/PHILOSOPHY.md`');
    expect(block).toContain('Codex doctrine active');
    expect(block).toContain('read at the start');
  });

  it.each([
    ['claude', '`harness:ticket-runner`'],
    ['codex', '`ticket-runner`'],
  ] as const)('installs the active-program bootstrap for %s', (runtime, runner) => {
    const block = harnessBlock(input, runtime);
    expect(block).toContain('`.void/active.md`');
    expect(block).toContain('`status: executing`');
    expect(block).toContain('The tracker owns mutable execution state');
    expect(block).toContain(runner);
    expect(block).toContain('competing claims');
    expect(block).toContain('stop rather than infer progress locally');
    // Consent is never inferred from silence: without an enabled autopilot
    // block, no autonomous selection may happen at all.
    expect(block).toContain('autopilot');
    expect(block).toContain('enabled: false');
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

describe('patchExistingRuntimeDocs (per-runtime, add/remove)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'void-existing-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('refreshes only the docs that exist and never resurrects the absent one', async () => {
    // A Codex-only project: AGENTS.md present, CLAUDE.md absent.
    await patchAgentsMd(dir, input);
    const patched = await patchExistingRuntimeDocs(dir, input);
    expect(patched).toEqual(['codex']);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false); // not resurrected
  });

  it('refreshes both when both exist', async () => {
    await patchClaudeMd(dir, input);
    await patchAgentsMd(dir, input);
    expect(await patchExistingRuntimeDocs(dir, input)).toEqual(['claude', 'codex']);
  });

  it('is a no-op on a project with no doctrine docs', async () => {
    expect(await patchExistingRuntimeDocs(dir, input)).toEqual([]);
  });
});
