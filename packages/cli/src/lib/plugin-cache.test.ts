/**
 * Tests for the plugin-cache health helpers (#68): the hooks a plugin.json
 * wires must exist and be executable in the installed cache.
 */

import { describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hookHealthIssues, locatePluginDir, wiredHooks } from './plugin-cache.js';

// Real manifest commands carry a literal ${CLAUDE_PLUGIN_ROOT} prefix; build it
// by concatenation so biome's noTemplateCurlyInString does not flag the fixture.
const ROOT = '$' + '{CLAUDE_PLUGIN_ROOT}';
const MANIFEST = {
  hooks: {
    PreToolUse: [
      { hooks: [{ command: `${ROOT}/hooks/tdd-guard.sh` }, { command: 'bash hooks/no-any-grep.sh' }] },
    ],
    SessionStart: [{ hooks: [{ command: `${ROOT}/hooks/sessionstart-context.sh` }] }],
  },
};

describe('wiredHooks', () => {
  it('extracts the distinct hooks/*.sh references, sorted', () => {
    expect(wiredHooks(MANIFEST)).toEqual([
      'hooks/no-any-grep.sh',
      'hooks/sessionstart-context.sh',
      'hooks/tdd-guard.sh',
    ]);
  });

  it('returns nothing for a manifest with no hooks', () => {
    expect(wiredHooks({})).toEqual([]);
  });
});

function pluginFixture(hooks: Record<string, { exec: boolean }>): string {
  const dir = mkdtempSync(join(tmpdir(), 'plugin-cache-'));
  mkdirSync(join(dir, 'hooks'), { recursive: true });
  for (const [name, { exec }] of Object.entries(hooks)) {
    const abs = join(dir, 'hooks', name);
    writeFileSync(abs, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(abs, exec ? 0o755 : 0o644);
  }
  return dir;
}

describe('hookHealthIssues', () => {
  it('reports nothing when every wired hook exists and is executable', () => {
    const dir = pluginFixture({
      'tdd-guard.sh': { exec: true },
      'no-any-grep.sh': { exec: true },
      'sessionstart-context.sh': { exec: true },
    });
    try {
      expect(hookHealthIssues(dir, MANIFEST)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a missing wired hook', () => {
    const dir = pluginFixture({ 'tdd-guard.sh': { exec: true }, 'sessionstart-context.sh': { exec: true } });
    try {
      const issues = hookHealthIssues(dir, MANIFEST);
      expect(issues.some((i) => i.includes('no-any-grep.sh') && i.includes('missing'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a present-but-non-executable hook', () => {
    const dir = pluginFixture({
      'tdd-guard.sh': { exec: false },
      'no-any-grep.sh': { exec: true },
      'sessionstart-context.sh': { exec: true },
    });
    try {
      const issues = hookHealthIssues(dir, MANIFEST);
      expect(issues.some((i) => i.includes('tdd-guard.sh') && i.includes('not executable'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('locatePluginDir', () => {
  it('returns undefined when the cache root does not exist', () => {
    expect(locatePluginDir(join(tmpdir(), 'no-such-cache-xyz'), 'harness')).toBeUndefined();
  });

  it('finds the plugin dir carrying a plugin.json whose path includes the name', () => {
    const cache = mkdtempSync(join(tmpdir(), 'cache-root-'));
    const pluginDir = join(cache, 'voidcorp', 'harness', '0.15.0');
    mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), '{"name":"harness"}');
    try {
      expect(locatePluginDir(cache, 'harness')).toBe(pluginDir);
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });
});
