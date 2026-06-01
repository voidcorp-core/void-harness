/**
 * Tests for packages/core/hooks/no-null-grep.sh
 *
 * The hook is a Claude Code PreToolUse hook: it reads the tool-call JSON
 * from stdin (https://code.claude.com/docs/en/hooks) and inspects
 * `.tool_name` + `.tool_input.file_path` + the new content. It blocks edits
 * that introduce a `null` literal in business TypeScript, preferring
 * `undefined` / `Option<T>`. Tests run it as a subprocess, pipe the JSON in,
 * and assert on exit code (0 allow, 2 block).
 *
 * The hook never reads the file from disk — only the JSON payload — so no
 * on-disk fixture is needed.
 *
 * Regression focus (session feedback): the matcher must be comment- and
 * string-aware. A literal `null` inside a `//` comment, a `/* *​/` block, or a
 * quoted string is NOT the `null` literal and must not be blocked. The
 * explicit `// allow-null:` override must still be honoured on the raw line.
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/no-null-grep.sh');

interface ToolCall {
  readonly tool: string;
  readonly file: string;
  readonly content?: string;
}

/** Run the hook with the Claude Code tool-call JSON piped to stdin. */
function runHook(call: ToolCall): { code: number; stderr: string } {
  const input = JSON.stringify({
    tool_name: call.tool,
    tool_input: { file_path: call.file, content: call.content ?? '' },
  });
  const proc = spawnSync('bash', [HOOK], { input, encoding: 'utf8' });
  return { code: proc.status ?? 1, stderr: proc.stderr ?? '' };
}

describe('no-null-grep.sh', () => {
  it('BLOCKS a real null literal in business code (exit 2)', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/feature.ts',
      content: 'export const x = null;',
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('null');
  });

  it('allows a `null` substring inside a line comment (exit 0)', () => {
    // The reported false positive: a comment that literally says "pas null".
    const result = runHook({
      tool: 'Edit',
      file: 'src/feature.ts',
      content: '// surtout pas null ici\nexport const x = undefined;',
    });
    expect(result.code).toBe(0);
  });

  it('allows a `null` substring inside a block comment (exit 0)', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/feature.ts',
      content: '/* returns null on failure historically */\nexport const x = undefined;',
    });
    expect(result.code).toBe(0);
  });

  it('allows a `null` substring inside a string literal (exit 0)', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/feature.ts',
      content: 'export const label = "value is null";',
    });
    expect(result.code).toBe(0);
  });

  it('allows a `null` substring in a trailing comment after real code (exit 0)', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/feature.ts',
      content: 'export const x = undefined; // never null here',
    });
    expect(result.code).toBe(0);
  });

  it('still BLOCKS a real null literal even when a comment also mentions null (exit 2)', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/feature.ts',
      content: 'export const x = null; // intentional',
    });
    expect(result.code).toBe(2);
  });

  it('honours the explicit // allow-null: override on the raw line (exit 0)', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/feature.ts',
      content: 'export const x = null; // allow-null: drizzle boundary',
    });
    expect(result.code).toBe(0);
  });

  it('ignores tools other than Edit/Write (exit 0)', () => {
    const result = runHook({ tool: 'Read', file: 'src/feature.ts' });
    expect(result.code).toBe(0);
  });

  it('bypasses test files (exit 0)', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/feature.test.ts',
      content: 'export const x = null;',
    });
    expect(result.code).toBe(0);
  });

  it('skips non-TypeScript files (exit 0)', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/config.json',
      content: '{ "value": null }',
    });
    expect(result.code).toBe(0);
  });

  it('hook script exists', () => {
    expect(existsSync(HOOK)).toBe(true);
  });
});
