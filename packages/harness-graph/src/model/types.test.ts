import { describe, expect, it } from 'vitest';
import { nodeId } from './types.js';

describe('nodeId', () => {
  it('namespaces a core node by type and name', () => {
    expect(nodeId('skill', 'tdd', null)).toBe('skill:tdd');
  });
  it('namespaces a pack node by pack folder', () => {
    expect(nodeId('skill', 'cache-component-pattern', 'pack-nextjs')).toBe('skill:pack-nextjs/cache-component-pattern');
  });
});
