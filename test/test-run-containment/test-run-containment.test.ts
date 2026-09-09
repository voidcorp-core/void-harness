import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('the Vitest process boundary', () => {
  it('routes home, temporary files and Void global state into one run-owned root', () => {
    const root = process.env['VOID_TEST_RUN_ROOT'];

    expect(root).toBeDefined();
    if (root === undefined) return;

    expect(resolve(tmpdir())).toBe(resolve(join(root, 'tmp')));
    expect(resolve(homedir())).toBe(resolve(join(root, 'home')));
    expect(resolve(process.env['VOID_GLOBAL_DIR'] ?? '')).toBe(
      resolve(join(root, 'void-global')),
    );
  });
});
