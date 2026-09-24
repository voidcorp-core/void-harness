import { describe, expect, it } from 'vitest';
import { readsStdin } from './autopilot-usage.js';

describe('Autopilot invocation usage', () => {
  it('waits on a pipe for exactly the subcommands that read one', () => {
    expect(readsStdin(['next'])).toBe(true);
    expect(readsStdin(['verdict', '--ticket', 'DEV-1', '--pr', '11'])).toBe(true);
    expect(readsStdin(['arm', '--ticket', 'DEV-1', '--pr', '11'])).toBe(false);
    expect(readsStdin(['next', '--help'])).toBe(false);
    expect(readsStdin(['nonesuch'])).toBe(false);
  });
});
