import { describe, expect, it } from 'vitest';
import { asksForHelp } from './main.js';

describe('asksForHelp', () => {
  it('treats --help as a request to explain, not to act', () => {
    // The defect this pins: `init --help --no-interactive` created 135 files.
    expect(asksForHelp('init', ['--help', '--no-interactive'])).toBe(true);
    expect(asksForHelp('status', ['--help'])).toBe(true);
    expect(asksForHelp('update', ['-h'])).toBe(true);
  });

  it('lets a command with its own help print it', () => {
    // These render a more specific usage than the global reference.
    for (const cmd of ['mission', 'security', 'decisions', 'autopilot']) {
      expect(asksForHelp(cmd, ['--help']), cmd).toBe(false);
    }
  });

  it('does not hijack a run that never asked for help', () => {
    expect(asksForHelp('init', ['--no-interactive'])).toBe(false);
    expect(asksForHelp('doctor', [])).toBe(false);
  });

  it('says no when there is no command at all', () => {
    expect(asksForHelp(undefined, ['--help'])).toBe(false);
  });
});
