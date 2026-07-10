import { describe, it, expect } from 'vitest';
import { findChrome } from './pdf.js';

describe('findChrome', () => {
  it('honours CHROME_PATH when the file exists', () => {
    expect(findChrome({ env: { CHROME_PATH: '/c' }, exists: (p) => p === '/c' })).toBe('/c');
  });

  it('returns undefined when the override does not exist', () => {
    expect(findChrome({ env: { CHROME_PATH: '/missing' }, exists: () => false })).toBeUndefined();
  });

  it('picks the first existing macOS candidate', () => {
    expect(findChrome({ platform: 'darwin', env: {}, exists: (p) => p.includes('Google Chrome') })).toBe(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    );
  });

  it('falls back to a later linux candidate', () => {
    expect(findChrome({ platform: 'linux', env: {}, exists: (p) => p === '/usr/bin/chromium' })).toBe(
      '/usr/bin/chromium',
    );
  });

  it('returns undefined when no browser is installed', () => {
    expect(findChrome({ platform: 'linux', env: {}, exists: () => false })).toBeUndefined();
  });
});
