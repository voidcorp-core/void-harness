import { describe, expect, it } from 'vitest';
import type { InstallReceipt } from '../lib/receipts.js';
import { localInitArgs, updateModeFor } from './update.js';

const receipt = (source: InstallReceipt['source']): InstallReceipt => ({
  schemaVersion: 1,
  version: '2.0.2',
  source,
  runtimes: ['codex'],
  files: [],
});

describe('update routing', () => {
  it('keeps local receipts offline and marketplace receipts on the remote adapter', () => {
    expect(updateModeFor(receipt('local'))).toBe('local');
    expect(updateModeFor(receipt('marketplace'))).toBe('marketplace');
    expect(updateModeFor(undefined)).toBe('marketplace');
  });
});

describe('localInitArgs', () => {
  it('carries the recorded runtimes and the selected packs', () => {
    const args = localInitArgs(receipt('local'), ['monorepo', 'react'], { force: false });

    expect(args).toContain('--no-interactive');
    expect(args).toContain('--replace-packs');
    expect(args.join(' ')).toContain('--runtime codex');
    expect(args.join(' ')).toContain('--pack monorepo');
    expect(args.join(' ')).toContain('--pack react');
  });

  it('does not force by default', () => {
    expect(localInitArgs(receipt('local'), [], { force: false })).not.toContain('--force');
  });

  /**
   * Reported from a real consumer project on 2.6.0. `init` refuses to clobber a
   * managed file it cannot prove it wrote and says "preserve it or re-run with
   * --force" — but `update` never parsed the flag nor passed it on, so the
   * remedy the tool printed could not be applied through the command that
   * printed it. An instruction that cannot be followed is worse than none.
   */
  it('forwards --force so the remedy it prints can actually be applied', () => {
    expect(localInitArgs(receipt('local'), [], { force: true })).toContain('--force');
  });
});
