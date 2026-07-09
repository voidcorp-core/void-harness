/**
 * Unit tests for the pure init helpers most exposed to the audited failure
 * modes (#67): an unresolved marketplace must never write a stale core pin, and
 * every unmet prerequisite must surface as an impossible-to-miss checklist item.
 */

import { describe, expect, it } from 'vitest';
import { buildDefaultConfig, buildFinalChecklist } from './init.js';
import type { CheckResult } from '../lib/prerequisites.js';
import type { Stack } from '../lib/stack.js';

const STACK: Stack = { packageManager: 'pnpm', testRunner: 'vitest', e2eRunner: 'none' };

describe('buildDefaultConfig pin behavior', () => {
  it('pins core when a version was resolved', () => {
    const config = buildDefaultConfig({ pinVersion: '0.14.0', stack: STACK });
    expect(config.core).toBe('^0.14.0');
  });

  it('omits the core pin entirely when the marketplace was unreachable', () => {
    const config = buildDefaultConfig({ pinVersion: undefined, stack: STACK });
    expect(config.core).toBeUndefined();
    expect('core' in config).toBe(false);
    // and never a stale literal
    expect(JSON.stringify(config)).not.toContain('0.1.0');
  });
});

describe('buildFinalChecklist', () => {
  const ok: CheckResult = { name: 'jq', ok: true, message: 'available' };
  const failJq: CheckResult = { name: 'jq', ok: false, message: 'jq not installed', fix: 'brew install jq' };
  const failGh: CheckResult = { name: 'gh CLI', ok: false, message: 'gh not authenticated', fix: 'gh auth login' };

  it('always leads with restart and trust steps', () => {
    const items = buildFinalChecklist([ok], true);
    expect(items[0]).toContain('restart Claude Code');
    expect(items[1]).toContain('trust prompt');
  });

  it('adds a FAILED line with remediation for each unmet prerequisite', () => {
    const items = buildFinalChecklist([failJq, failGh], true);
    const failed = items.filter((i) => i.startsWith('FAILED:'));
    expect(failed).toHaveLength(2);
    expect(failed[0]).toContain('brew install jq');
    expect(failed[1]).toContain('gh auth login');
  });

  it('flags an unresolved pin as its own FAILED item', () => {
    const items = buildFinalChecklist([ok], false);
    const pinItem = items.find((i) => i.includes('core version unresolved'));
    expect(pinItem).toBeDefined();
    expect(pinItem).toContain('FAILED:');
    expect(pinItem).toContain('void-harness update');
  });

  it('produces no FAILED lines when everything is healthy', () => {
    const items = buildFinalChecklist([ok], true);
    expect(items.some((i) => i.startsWith('FAILED:'))).toBe(false);
  });
});
