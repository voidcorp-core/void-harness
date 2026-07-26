import { describe, expect, it } from 'vitest';
// @ts-expect-error - compatibility shim is a plain ESM script
import { commandFor } from '../../scripts/build-decisions-index.mjs';

describe('legacy decisions script', () => {
  it('renders the current projection without writing a shared index', () => {
    expect(commandFor([])).toEqual([
      'decisions',
      'render',
      '--format',
      'markdown',
    ]);
  });

  it('delegates structural and immutability checks to the public CLI', () => {
    expect(commandFor(['--check'])).toEqual(['decisions', 'check']);
  });
});
