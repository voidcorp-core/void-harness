/**
 * Tests for the .void/config.json Zod schema (#68). A malformed config must be
 * reported with the offending JSON path; a valid or legacy-but-well-typed
 * config must pass without noise.
 */

import { describe, expect, it } from 'vitest';
import { packsCoherenceIssues, validateConfig } from './config-schema.js';

const VALID = {
  core: '^0.14.0',
  packs: { '@voidcorp/harness-nextjs': '^0.14.0' },
  stack: { packageManager: 'pnpm', testRunner: 'vitest', e2eRunner: 'none' },
  paths: { business: 'apps/*/src/**', tests: 'apps/*/src/**/*.test.ts' },
  commands: { test: 'pnpm test' },
  modes: { tdd: 'auto', codeReview: 'auto' },
};

describe('validateConfig', () => {
  it('accepts a well-formed config', () => {
    expect(validateConfig(VALID)).toEqual({ ok: true, issues: [] });
  });

  it('accepts a legacy minimal config (all fields optional)', () => {
    expect(validateConfig({ paths: { business: 'src/**' } }).ok).toBe(true);
    expect(validateConfig({}).ok).toBe(true);
  });

  it('tolerates unknown/extra top-level keys (forward compatible)', () => {
    expect(validateConfig({ ...VALID, futureField: { anything: true } }).ok).toBe(true);
  });

  it('flags a non-string paths value with its JSON path', () => {
    const r = validateConfig({ ...VALID, paths: { business: 42 } });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.startsWith('paths.business:'))).toBe(true);
  });

  it('flags a non-semver core pin with its JSON path', () => {
    const r = validateConfig({ ...VALID, core: 'latest' });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.startsWith('core:') && i.includes('semver'))).toBe(true);
  });

  it('flags a non-semver pack pin with the pack path', () => {
    const r = validateConfig({ ...VALID, packs: { '@voidcorp/harness-nextjs': 'garbage' } });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes('packs.@voidcorp/harness-nextjs'))).toBe(true);
  });

  it('flags a malformed stack (missing/typed field)', () => {
    const r = validateConfig({ ...VALID, stack: { packageManager: 'pnpm', testRunner: 5, e2eRunner: 'none' } });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.startsWith('stack.testRunner:'))).toBe(true);
  });

  it('accepts caret, tilde and bare semver ranges', () => {
    expect(validateConfig({ core: '^1.2.3' }).ok).toBe(true);
    expect(validateConfig({ core: '~1.2.3' }).ok).toBe(true);
    expect(validateConfig({ core: '1.2.3' }).ok).toBe(true);
    expect(validateConfig({ core: '1.2.3-beta.1' }).ok).toBe(true);
  });
});

describe('packsCoherenceIssues', () => {
  it('reports nothing when enabled and pinned packs match', () => {
    expect(packsCoherenceIssues(['harness-nextjs', 'harness-react'], ['harness-nextjs', 'harness-react'])).toEqual([]);
  });

  it('flags a pack enabled in settings but not pinned in config', () => {
    const issues = packsCoherenceIssues(['harness-nextjs'], []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('harness-nextjs');
    expect(issues[0]).toContain('not pinned');
  });

  it('flags a pack pinned in config but not enabled in settings', () => {
    const issues = packsCoherenceIssues([], ['harness-react']);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('harness-react');
    expect(issues[0]).toContain('not enabled');
  });

  it('reports both directions of divergence', () => {
    const issues = packsCoherenceIssues(['harness-nextjs'], ['harness-react']);
    expect(issues).toHaveLength(2);
  });

  it('treats empty/empty as in sync (zero packs)', () => {
    expect(packsCoherenceIssues([], [])).toEqual([]);
  });
});
