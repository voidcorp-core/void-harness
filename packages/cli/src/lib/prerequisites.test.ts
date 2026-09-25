/**
 * Tests for the shared prerequisite checks (#67). The gh presence check is
 * exercised against a PATH stripped of the tool, so the "not installed"
 * branches — the ones that previously let init succeed silently — are covered.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { PRODUCT_IDENTITY } from '@voidcorp/hook-runner';
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
      '.github/workflows/floor.yml': `jobs:\n  x:\n    uses: ${PRODUCT_IDENTITY.repositorySlug}/.github/workflows/enforce.yml@main\n`,
    });
    const r = checkEnforceWorkflow(dir);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/adopted|enforc/i);
    expect(r.fix).toBeUndefined();
  });

  // GitHub redirects git and web traffic after a rename, never a workflow's `uses:`: the job fails
  // with "repository not found", so calling that floor adopted would be the comfortable lie.
  it.each(PRODUCT_IDENTITY.formerRepositorySlugs)('flags a reusable workflow still called from %s', (former) => {
    const dir = workspace({
      '.github/workflows/floor.yml': `jobs:\n  x:\n    uses: ${former}/.github/workflows/enforce.yml@main\n`,
    });
    const r = checkEnforceWorkflow(dir);
    expect(r.ok).toBe(true);
    expect(r.status).toBe('advisory');
    expect(r.message).toContain(former);
    expect(r.fix).toContain(`${PRODUCT_IDENTITY.repositorySlug}/.github/workflows/enforce.yml`);
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
