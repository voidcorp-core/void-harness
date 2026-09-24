import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { evaluateRule } from './runner.js';

it.each([4_999, 5_000])('enforces the approved shared deadline at %i milliseconds', (elapsed) => {
  const root = mkdtempSync(join(tmpdir(), 'syntax-budget-'));
  const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(elapsed);
  try {
    const result = evaluateRule('no-focused-test', { tool_name: 'Write', tool_input: {
      file_path: 'page.test.ts', content: 'test("renders page", () => {});',
    } }, { root });
    expect(result.allow).toBe(elapsed < 5_000);
    if (elapsed === 5_000) expect(result.code).toBe('TEST_SYNTAX_UNVERIFIED');
  } finally {
    clock.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});
