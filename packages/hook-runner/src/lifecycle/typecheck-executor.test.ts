import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeTypecheck } from './typecheck-executor.js';

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'void-typecheck-'));
}

// This executor is the one place a repository-supplied string becomes a running
// process, so its entry contract is worth holding down: it must decline early and
// say why, rather than reach for a command in a situation it cannot judge.
describe('executeTypecheck, before anything is executed', () => {
  it('declines outside a git repository instead of guessing what changed', () => {
    const result = executeTypecheck(scratch(), {});

    expect(result.status).toBe('skipped');
    expect(result.details).toMatchObject({ reason: 'non-git-or-git-unavailable' });
  });

  it('declines when git itself cannot be resolved', () => {
    // An empty PATH is the honest way to ask "and if the tool is missing?" — the
    // answer must be a skip with a reason, never a throw at the Stop hook.
    const root = scratch();
    mkdirSync(join(root, '.void'), { recursive: true });
    writeFileSync(join(root, '.void', 'config.json'), '{}');

    const result = executeTypecheck(root, { PATH: '' });

    expect(result.status).toBe('skipped');
  });
});
