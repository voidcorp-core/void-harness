import { describe, expect, it } from 'vitest';
import { normalizeToolCall } from './normalize.js';

describe('normalizeToolCall', () => {
  it('normalizes Claude Edit and Write content', () => {
    expect(normalizeToolCall({
      tool_name: 'Edit',
      tool_input: { file_path: 'apps/web/src/Card.tsx', new_string: 'export const Card = 1;' },
    })).toEqual({
      tool: 'Edit',
      command: '',
      edits: [{ path: 'apps/web/src/Card.tsx', addedContent: 'export const Card = 1;' }],
    });
  });

  it('normalizes a multi-file Codex apply_patch to added content only', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: apps/web/.env',
      '-OLD=gone',
      '+TOKEN=added',
      '*** Add File: apps/web/src/a.ts',
      '+export const a = 1;',
      '*** Delete File: apps/web/src/old.ts',
      '*** End Patch',
    ].join('\n');

    expect(normalizeToolCall({
      tool_name: 'apply_patch',
      tool_input: { patch },
    })).toEqual({
      tool: 'apply_patch',
      command: '',
      edits: [
        { path: 'apps/web/.env', addedContent: 'TOKEN=added\n' },
        { path: 'apps/web/src/a.ts', addedContent: 'export const a = 1;\n' },
        { path: 'apps/web/src/old.ts', addedContent: '' },
      ],
    });
  });

  it('joins shell argv and extracts an embedded apply_patch envelope', () => {
    const patch = '*** Begin Patch\n*** Update File: .env\n+S=1\n*** End Patch';
    const call = normalizeToolCall({
      tool_name: 'shell',
      tool_input: { command: ['apply_patch', patch] },
    });
    expect(call.command).toContain('apply_patch');
    expect(call.edits).toEqual([{ path: '.env', addedContent: 'S=1\n' }]);
  });

  it('rejects malformed shapes and NUL-bearing strings', () => {
    expect(() => normalizeToolCall(null)).toThrow(/invalid hook input/i);
    expect(() => normalizeToolCall({
      tool_name: 'Write',
      tool_input: { file_path: 'a.ts\u0000.env', content: 'x' },
    })).toThrow(/unsafe hook input/i);
  });
});
