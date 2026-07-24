import { describe, expect, it } from 'vitest';
import { secretContent } from './secret-content.js';

describe('secretContent', () => {
  it('blocks high-confidence tokens without committing a real-looking fixture', () => {
    const token = `AKIA${'A1'.repeat(8)}`;
    const verdict = secretContent([{ path: 'src/config.ts', addedContent: `export const key = '${token}';` }]);
    expect(verdict.allow).toBe(false);
    expect(verdict.evidence[0]).toContain('src/config.ts:1');
  });

  it('blocks mixed generic assignments and allows documented placeholders', () => {
    expect(secretContent([{
      path: 'src/config.ts',
      addedContent: 'SERVICE_TOKEN="abcDEF1234567890abcDEF123456"',
    }]).allow).toBe(false);
    expect(secretContent([{
      path: 'src/config.ts',
      addedContent: 'SERVICE_TOKEN="your_token_placeholder"',
    }]).allow).toBe(true);
  });

  it('exempts tests and an explicit allow tag', () => {
    const token = `AKIA${'A1'.repeat(8)}`;
    expect(secretContent([{ path: 'src/a.test.ts', addedContent: token }]).allow).toBe(true);
    expect(secretContent([{
      path: 'src/a.ts',
      addedContent: `${token} // allow-secret-pattern: generated fixture`,
    }]).allow).toBe(true);
  });
});
