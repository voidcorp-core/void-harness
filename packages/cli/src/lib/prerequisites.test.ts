/**
 * Tests for the shared prerequisite checks (#67). The jq/gh presence checks are
 * exercised against a PATH stripped of those tools, so the "not installed"
 * branches — the ones that previously let init succeed silently — are covered.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { checkGh, checkJq } from './prerequisites.js';

const ORIGINAL_PATH = process.env.PATH;
afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});

describe('checkJq', () => {
  it('reports jq available when it is on PATH', () => {
    // CI and the dev machine both have jq (it is a documented prerequisite).
    const r = checkJq();
    expect(r.ok).toBe(true);
  });

  it('reports NOT ok with a remediation when jq is absent from PATH', () => {
    process.env.PATH = '';
    const r = checkJq();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('jq not installed');
    expect(r.fix).toContain('brew install jq');
  });
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
