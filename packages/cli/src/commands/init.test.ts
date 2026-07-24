/**
 * Unit tests for the pure init helpers most exposed to the audited failure
 * modes (#67): an unresolved marketplace must never write a stale core pin, and
 * every unmet prerequisite must surface as an impossible-to-miss checklist item.
 */

import { describe, expect, it } from 'vitest';
import { buildDefaultConfig, buildFinalChecklist, resolveInstallSource } from './init.js';
import type { CheckResult } from '../lib/prerequisites.js';
import type { Stack } from '../lib/stack.js';

const STACK: Stack = { packageManager: 'pnpm', testRunner: 'vitest', e2eRunner: 'none', mutationRunner: 'none' };

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

  it('leads with the adapters\' next-steps in order', () => {
    const steps = ['restart Claude Code', 'trust the project .codex/ layer'];
    const items = buildFinalChecklist([ok], steps);
    expect(items[0]).toBe('restart Claude Code');
    expect(items[1]).toBe('trust the project .codex/ layer');
  });

  it('adds a FAILED line with remediation for each unmet prerequisite, after the steps', () => {
    const items = buildFinalChecklist([failJq, failGh], ['step one']);
    const failed = items.filter((i) => i.startsWith('FAILED:'));
    expect(failed).toHaveLength(2);
    expect(failed[0]).toContain('brew install jq');
    expect(failed[1]).toContain('gh auth login');
    expect(items[0]).toBe('step one');
  });

  it('passes through a FAILED next-step (e.g. an unresolved pin from the Claude adapter)', () => {
    const items = buildFinalChecklist([ok], ['FAILED: core version unresolved — run gh auth login']);
    const pinItem = items.find((i) => i.includes('core version unresolved'));
    expect(pinItem).toContain('FAILED:');
  });

  it('produces no FAILED lines when everything is healthy', () => {
    const items = buildFinalChecklist([ok], ['restart Claude Code']);
    expect(items.some((i) => i.startsWith('FAILED:'))).toBe(false);
  });
});

describe('install source', () => {
  it('defaults to the bundled local package and requires an explicit marketplace opt-in', () => {
    expect(resolveInstallSource([])).toBe('local');
    expect(resolveInstallSource(['--marketplace'])).toBe('marketplace');
    expect(resolveInstallSource(['--source', 'marketplace'])).toBe('marketplace');
    expect(resolveInstallSource(['--source', 'local'])).toBe('local');
  });
});
