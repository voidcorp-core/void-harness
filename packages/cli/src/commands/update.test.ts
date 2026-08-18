import { describe, expect, it } from 'vitest';
import type { InstallReceipt } from '../lib/receipts.js';
import { localInitArgs, updateModeFor, updateRouteFor } from './update.js';

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
  it('scopes --force to managed asset conflicts without replacing project config', () => {
    const args = localInitArgs(receipt('local'), [], { force: true });

    expect(args).toContain('--force-managed-assets');
    expect(args).not.toContain('--force');
  });
});

// The receipt is observed state, so it is gitignored and absent from every
// clone. Reading the route from it alone made `update` fall through to the
// marketplace branch on a colleague's fresh checkout: it pulled a plugin cache,
// bumped the pins, materialised nothing, and reported success. The install
// manifest is the committed half of the same fact and is always there.
describe('updateRouteFor', () => {
  it('follows the receipt when there is one', () => {
    expect(updateRouteFor(receipt('local'), true)).toBe('local');
    expect(updateRouteFor(receipt('marketplace'), true)).toBe('marketplace');
  });

  // A local install whose receipt is gone cannot be updated: nothing says which
  // files the harness owns, so the ownership diff that removes renamed skills
  // has no input. Saying so is the fix; guessing would delete or duplicate.
  it('reports a local install that lost its receipt, rather than guessing', () => {
    expect(updateRouteFor(undefined, true)).toBe('local-receipt-missing');
  });

  it('is a marketplace install when neither is there', () => {
    expect(updateRouteFor(undefined, false)).toBe('marketplace');
  });
})
