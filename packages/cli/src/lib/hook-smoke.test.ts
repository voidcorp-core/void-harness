import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { smokeInstalledHook } from './hook-smoke.js';

const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'void-hook-smoke-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('smokeInstalledHook', () => {
  it('requires the executable to emit the expected canonical event', async () => {
    const root = scratch();
    const hook = join(root, 'hook.sh');
    writeFileSync(hook, '#!/bin/sh\nexit 0\n');
    chmodSync(hook, 0o755);

    const result = await smokeInstalledHook(hook, 'codex');

    expect(result).toMatchObject({
      fired: false,
      detail: expect.stringContaining('no matching event'),
    });
  });

  it('reports a non-executable installed hook without trying a shell fallback', async () => {
    const root = scratch();
    const hook = join(root, 'hook.sh');
    writeFileSync(hook, '#!/bin/sh\nexit 0\n');
    chmodSync(hook, 0o644);

    const result = await smokeInstalledHook(hook, 'codex');

    expect(result).toEqual({
      fired: false,
      detail: 'hook is not executable',
    });
  });
});
