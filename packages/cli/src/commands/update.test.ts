import { describe, expect, it } from 'vitest';
import type { InstallReceipt } from '../lib/receipts.js';
import { updateModeFor } from './update.js';

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
