/**
 * Tests for the shared prerequisite checks (#67). The gh presence check is
 * exercised against a PATH stripped of the tool, so the "not installed"
 * branches — the ones that previously let init succeed silently — are covered.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkEnforceWorkflow, checkGh } from './prerequisites.js';

const ORIGINAL_PATH = process.env.PATH;
afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});

describe('checkGh', () => {
  it('reports NOT ok with a remediation when gh is absent from PATH', () => {
    process.env.PATH = '';
    const r = checkGh();
    expect(r.ok).toBe(false);
    // With gh entirely missing the message is the not-installed variant, distinct
    // from the not-authenticated one.
    expect(r.message).toContain('not installed');
    expect(r.fix).toContain('gh');
  });
});

describe('checkEnforceWorkflow', () => {
  function workspace(files: Record<string, string> = {}): string {
    const dir = mkdtempSync(join(tmpdir(), 'enforce-wf-'));
    for (const [rel, content] of Object.entries(files)) {
      const full = join(dir, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, content);
    }
    return dir;
  }

  // Advisory only — it must NEVER block doctor (ok stays true), so a project
  // that has not adopted the server-side floor still passes, just with a hint.
  it('confirms adoption when a workflow references the reusable enforce workflow', () => {
    const dir = workspace({
      '.github/workflows/floor.yml': 'jobs:\n  x:\n    uses: voidcorp-core/void-harness/.github/workflows/enforce.yml@main\n',
    });
    const r = checkEnforceWorkflow(dir);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/adopted|enforc/i);
    expect(r.fix).toBeUndefined();
  });

  it('confirms adoption when a workflow references the local composite action', () => {
    const dir = workspace({ '.github/workflows/void-enforce.yml': 'steps:\n  - uses: ./.github/actions/void-enforce\n' });
    expect(checkEnforceWorkflow(dir).ok).toBe(true);
  });

  it('stays ok but suggests adoption when workflows exist without the floor', () => {
    const dir = workspace({ '.github/workflows/ci.yml': 'jobs:\n  test:\n    runs-on: ubuntu-latest\n' });
    const r = checkEnforceWorkflow(dir);
    expect(r.ok).toBe(true);
    expect(r.fix).toMatch(/enforce/i);
  });

  it('stays ok and is not applicable when there is no .github/workflows dir', () => {
    const dir = workspace();
    const r = checkEnforceWorkflow(dir);
    expect(r.ok).toBe(true);
    expect(r.fix).toBeUndefined();
  });

  it('stays ok (never throws) when a workflows entry is unreadable', () => {
    // A directory named like a workflow file (or a broken symlink) makes
    // readFileSync throw EISDIR. doctor collects checks before printing, so an
    // uncaught throw here would discard every other diagnostic — advisory must
    // degrade, not crash.
    const dir = workspace();
    mkdirSync(join(dir, '.github', 'workflows', 'weird.yml'), { recursive: true });
    expect(() => checkEnforceWorkflow(dir)).not.toThrow();
    expect(checkEnforceWorkflow(dir).ok).toBe(true);
  });
});
