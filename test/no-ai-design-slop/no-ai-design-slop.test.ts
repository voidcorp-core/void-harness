/**
 * Tests for packages/core/hooks/no-ai-design-slop.sh
 *
 * The hook is a Claude Code PreToolUse hook: it reads the tool-call JSON from
 * stdin (https://code.claude.com/docs/en/hooks) and inspects `.tool_name` +
 * `.tool_input.file_path` + the new content. It is a STATIC gate (distinct from
 * gstack's live /design-review) that blocks a small set of unambiguous "AI
 * design tells": an explicitly-set default Inter font, a cliché purple/indigo
 * -> blue two-stop gradient, cards nested directly inside cards, and grey text
 * on a coloured background. Tests run it as a subprocess, pipe the JSON in, and
 * assert on exit code (0 allow, 2 block).
 *
 * The hook never reads the file from disk — only the JSON payload — so no
 * on-disk fixture is needed.
 *
 * Design intent: the gate is deliberately conservative. The false-positive
 * cases below (clean single-hue gradient, grey text with no coloured bg, a tell
 * that lives only in a comment, a non-style file) MUST NOT block. The explicit
 * `// allow-design-slop:` / `/* allow-design-slop: *​/` override MUST be honoured.
 */

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HOOK = resolve(process.cwd(), 'packages/core/hooks/no-ai-design-slop.sh');

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

describe('no-ai-design-slop.sh — blocks net AI design tells (exit 2)', () => {
  it('BLOCKS a cliché purple->blue Tailwind gradient', () => {
    const result = runHook({
      tool: 'Write',
      file: 'src/Hero.tsx',
      content: '<div className="bg-gradient-to-r from-purple-500 to-blue-500">x</div>',
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('gradient');
  });

  it('BLOCKS an explicitly-set default Inter font in CSS', () => {
    const result = runHook({
      tool: 'Write',
      file: 'src/global.css',
      content: 'body { font-family: Inter, sans-serif; }',
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Inter');
  });

  it('BLOCKS grey text on a coloured background', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/Card.tsx',
      content: '<p className="text-gray-400 bg-indigo-600">hi</p>',
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('grey');
  });

  it('BLOCKS a card nested directly inside a card', () => {
    const result = runHook({
      tool: 'Write',
      file: 'src/Panel.tsx',
      content: '<div className="card"><div className="card">x</div></div>',
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('card');
  });
});

describe('no-ai-design-slop.sh — conservative: does NOT block (exit 0)', () => {
  it('allows a distinctive single-hue gradient (not the purple->blue cliché)', () => {
    const result = runHook({
      tool: 'Write',
      file: 'src/Hero.tsx',
      content: '<div className="from-purple-500 to-purple-700">x</div>',
    });
    expect(result.code).toBe(0);
  });

  it('allows grey text when there is no coloured background on the line', () => {
    const result = runHook({
      tool: 'Edit',
      file: 'src/Card.tsx',
      content: '<p className="text-gray-400">hi</p>',
    });
    expect(result.code).toBe(0);
  });

  it('allows a clean, brand-specific Tailwind class set', () => {
    const result = runHook({
      tool: 'Write',
      file: 'src/Hero.tsx',
      content: '<div className="bg-slate-900 text-amber-200 rounded-xl">x</div>',
    });
    expect(result.code).toBe(0);
  });

  it('allows an "Inter" mention that lives only in a comment', () => {
    const result = runHook({
      tool: 'Write',
      file: 'src/global.css',
      content: '/* we deliberately avoid the Inter font-family here */',
    });
    expect(result.code).toBe(0);
  });

  it('honours the // allow-design-slop: override on the line', () => {
    const result = runHook({
      tool: 'Write',
      file: 'src/Hero.tsx',
      content: '<div className="from-purple-500 to-blue-500"> {/* allow-design-slop: brand ramp */}</div>',
    });
    expect(result.code).toBe(0);
  });

  it('ignores tools other than Edit/Write', () => {
    const result = runHook({ tool: 'Read', file: 'src/Hero.tsx' });
    expect(result.code).toBe(0);
  });

  it('skips non-style files (e.g. JSON config)', () => {
    const result = runHook({
      tool: 'Write',
      file: 'src/theme.json',
      content: '{ "font-family": "Inter", "gradient": "from-purple-500 to-blue-500" }',
    });
    expect(result.code).toBe(0);
  });

  it('hook script exists', () => {
    expect(existsSync(HOOK)).toBe(true);
  });
});
