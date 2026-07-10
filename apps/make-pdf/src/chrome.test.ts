import { describe, it, expect } from 'vitest';
import { findChrome } from './chrome.js';

describe('findChrome', () => {
  it('honours CHROME_PATH when the file exists', () => {
    const found = findChrome({
      env: { CHROME_PATH: '/custom/chrome' },
      exists: (p) => p === '/custom/chrome',
    });
    expect(found).toBe('/custom/chrome');
  });

  it('returns undefined when the override path does not exist', () => {
    const found = findChrome({
      env: { CHROME_PATH: '/missing/chrome' },
      exists: () => false,
    });
    expect(found).toBeUndefined();
  });

  it('picks the first existing macOS candidate', () => {
    const found = findChrome({
      platform: 'darwin',
      env: {},
      exists: (p) => p.includes('Google Chrome'),
    });
    expect(found).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  });

  it('falls back to a later candidate when the preferred one is absent', () => {
    const found = findChrome({
      platform: 'linux',
      env: {},
      exists: (p) => p === '/usr/bin/chromium',
    });
    expect(found).toBe('/usr/bin/chromium');
  });

  it('returns undefined when no browser is installed', () => {
    expect(findChrome({ platform: 'linux', env: {}, exists: () => false })).toBeUndefined();
  });
});
