import { describe, expect, it } from 'vitest';
import { noNull } from './no-null.js';

const edit = (path: string, addedContent: string) => [{ path, addedContent }];

describe('noNull', () => {
  it('blocks the literal used as a value, and honours the documented exception', () => {
    expect(noNull(edit('src/user.ts', 'const value = null;')).allow).toBe(false);
    expect(noNull(edit('src/user.ts', 'const label = "null"; // null docs')).allow).toBe(true);
    expect(noNull(edit('src/user.ts', 'const value = null; // allow-null: API boundary')).allow).toBe(true);
  });
});
// A React component renders nothing by returning null. There is no alternative
// spelling, so the rule was asking for the impossible and every .tsx component
// with a guard clause carried an `// allow-null:` comment that meant nothing.
describe('noNull and the one null React requires', () => {
  it('allows a component to render nothing', () => {
    expect(noNull(edit('src/Badge.tsx', '  if (!user) return null;')).allow).toBe(true);
    expect(noNull(edit('src/Badge.tsx', 'return null')).allow).toBe(true);
  });

  // Only that spelling, and only where JSX lives: the exemption is for what the
  // framework requires, not a licence to reintroduce null as a value.
  it('still refuses null used as a value, in the same file', () => {
    expect(noNull(edit('src/Badge.tsx', 'const selected = null;')).allow).toBe(false);
    expect(noNull(edit('src/Badge.tsx', 'foo({ user: null })')).allow).toBe(false);
  });

  it('does not extend the exemption to plain TypeScript', () => {
    expect(noNull(edit('src/user.ts', 'return null;')).allow).toBe(false);
  });
})
