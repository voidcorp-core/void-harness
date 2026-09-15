import { describe, expect, it } from 'vitest';
import { readsStdin } from './autopilot-usage.js';

describe('Autopilot invocation usage', () => {
  it('resolves the subcommand position rather than matching flag values', () => {
    expect(readsStdin(['abort', '--run', 'plan'])).toBe(false);
    expect(readsStdin(['--run', 'reconcile', 'reconcile'])).toBe(true);
    expect(readsStdin(['--run', 'reconcile', 'abort'])).toBe(false);
    expect(readsStdin(['--help'])).toBe(false);
    expect(readsStdin(['nonesuch'])).toBe(false);
  });

});
