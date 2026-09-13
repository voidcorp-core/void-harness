import { describe, expect, it } from 'vitest';
import { constants } from 'node:buffer';
import { proposedSource } from './proposed-source.js';

const patch = (body: string) => ({ tool_name: 'apply_patch',
  tool_input: { patch: `*** Begin Patch\n${body}\n*** End Patch` } });

describe('proposed file reconstruction', () => {
  it('refuses replace_all expansion before constructing an unrepresentable string', () => {
    const existing = 'x'.repeat(65_536);
    const after = 'y'.repeat(Math.floor(constants.MAX_STRING_LENGTH / existing.length) + 1);
    const raw = { tool_name: 'Edit', tool_input: {
      file_path: 'file.test.ts', old_string: 'x', new_string: after, replace_all: true,
    } };
    expect(() => proposedSource(raw, '/repo', 'file.test.ts', existing)).not.toThrow();
    expect(proposedSource(raw, '/repo', 'file.test.ts', existing).kind).toBe('unresolved');
  });

  it.each([['é', 'source'], ['€', 'unresolved']] as const)(
    'enforces the final UTF-8 byte ceiling after bounded allocation for %s', (after, kind) => {
      expect(proposedSource({ tool_name: 'Edit', tool_input: {
        old_string: 'x', new_string: after, replace_all: true,
      } }, '/repo', 'file.test.ts', 'x'.repeat(30_000)).kind).toBe(kind);
    },
  );

  it('retains unchanged lines between separate patch hunks', () => {
    const result = proposedSource(patch('*** Update File: file.test.ts\n@@\n /*\n-old\n+test.skip prose\n */\n@@\n-const x = 1;\n+const x = 2;'),
      '/repo', 'file.test.ts', '/*\nold\n*/\n\nconst x = 1;\n');
    expect(result).toEqual({ kind: 'source', content: '/*\ntest.skip prose\n*/\n\nconst x = 2;\n' });
  });

  it('reconstructs an Add File without consulting another file', () => {
    expect(proposedSource(patch('*** Add File: file.test.ts\n+// test.skip prose\n+const x = 1;'),
      '/repo', 'file.test.ts', undefined)).toEqual({ kind: 'source', content: '// test.skip prose\nconst x = 1;\n' });
  });

  it('supports explicit replace_all without confusing the default unique replacement', () => {
    const input = { file_path: 'file.test.ts', old_string: 'old', new_string: 'new' };
    expect(proposedSource({ tool_name: 'Edit', tool_input: input }, '/repo', 'file.test.ts', 'old old').kind).toBe('unresolved');
    expect(proposedSource({ tool_name: 'Edit', tool_input: { ...input, replace_all: true } },
      '/repo', 'file.test.ts', 'old old')).toEqual({ kind: 'source', content: 'new new' });
  });

  it.each([
    '*** Update File: file.test.ts\n@@\n-not present\n+new',
    '*** Update File: file.test.ts\n@@\n+unanchored',
    '*** Update File: file.test.ts\n*** Move to: other.test.ts\n@@\n-old\n+new',
    '*** Update File: file.test.ts\n@@\n-old\n+new\n*** Update File: file.test.ts\n@@\n-old\n+again',
  ])('does not invent missing or unsupported patch context', (body) => {
    expect(proposedSource(patch(body), '/repo', 'file.test.ts', 'old\n').kind).toBe('unresolved');
  });

  it('rejects ambiguous context and an incomplete patch frame', () => {
    expect(proposedSource(patch('*** Update File: file.test.ts\n@@\n-old\n+new'),
      '/repo', 'file.test.ts', 'old\nold\n').kind).toBe('unresolved');
    expect(proposedSource({ tool_name: 'apply_patch', tool_input: { patch: '*** Begin Patch\n*** Add File: file.test.ts\n+plain' } },
      '/repo', 'file.test.ts', undefined).kind).toBe('unresolved');
  });
});
