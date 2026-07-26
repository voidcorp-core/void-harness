import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commandsFor,
  detectPackageManager,
  detectStack,
  type Stack,
} from './stack.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'void-harness-stack-'));
}

function writePkg(root: string, pkg: object): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2));
}

describe('detectPackageManager', () => {
  it('reads packageManager field first', () => {
    const root = tmp();
    writePkg(root, { packageManager: 'pnpm@9.4.0' });
    writeFileSync(join(root, 'bun.lock'), '');
    expect(detectPackageManager(root)).toBe('pnpm');
  });

  it('falls back to lockfile when no packageManager field', () => {
    const root = tmp();
    writePkg(root, {});
    writeFileSync(join(root, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(root)).toBe('pnpm');
  });

  it('detects bun via bun.lock', () => {
    const root = tmp();
    writePkg(root, {});
    writeFileSync(join(root, 'bun.lock'), '');
    expect(detectPackageManager(root)).toBe('bun');
  });

  it('falls back to pnpm-workspace.yaml without lockfile', () => {
    const root = tmp();
    writePkg(root, {});
    writeFileSync(join(root, 'pnpm-workspace.yaml'), '');
    expect(detectPackageManager(root)).toBe('pnpm');
  });

  it('defaults to bun when nothing matches', () => {
    const root = tmp();
    writePkg(root, {});
    expect(detectPackageManager(root)).toBe('bun');
  });

  it('handles missing package.json (greenfield)', () => {
    const root = tmp();
    expect(detectPackageManager(root)).toBe('bun');
  });
});

describe('detectStack', () => {
  it('returns vitest + playwright when devDeps present', () => {
    const root = tmp();
    writePkg(root, {
      packageManager: 'pnpm@9.4.0',
      devDependencies: { vitest: '^2.0.0', '@playwright/test': '^1.0.0' },
    });
    const stack = detectStack(root);
    expect(stack.packageManager).toBe('pnpm');
    expect(stack.testRunner).toBe('vitest');
    expect(stack.e2eRunner).toBe('playwright');
  });

  it('returns jest + none when only jest present', () => {
    const root = tmp();
    writePkg(root, { devDependencies: { jest: '^29.0.0' } });
    const stack = detectStack(root);
    expect(stack.testRunner).toBe('jest');
    expect(stack.e2eRunner).toBe('none');
  });
});

describe('commandsFor', () => {
  it('uses pnpm exec for pnpm', () => {
    const stack: Stack = { packageManager: 'pnpm', testRunner: 'vitest', e2eRunner: 'playwright', mutationRunner: 'none' };
    const cmd = commandsFor(stack);
    expect(cmd.typecheck).toEqual(['pnpm', 'exec', 'tsc', '--noEmit']);
    expect(cmd.testUnit).toEqual(['pnpm', 'exec', 'vitest', 'run']);
    expect(cmd.testE2e).toEqual(['pnpm', 'exec', 'playwright', 'test']);
  });

  it('uses bunx for bun', () => {
    const stack: Stack = { packageManager: 'bun', testRunner: 'vitest', e2eRunner: 'playwright', mutationRunner: 'none' };
    expect(commandsFor(stack).typecheck).toEqual(['bunx', 'tsc', '--noEmit']);
  });

  it('uses npx for npm', () => {
    const stack: Stack = { packageManager: 'npm', testRunner: 'jest', e2eRunner: 'none', mutationRunner: 'none' };
    const cmd = commandsFor(stack);
    expect(cmd.typecheck).toEqual(['npx', 'tsc', '--noEmit']);
    expect(cmd.testUnit).toEqual(['npx', 'jest']);
  });

  it('uses yarn dlx-equivalent for yarn', () => {
    const stack: Stack = { packageManager: 'yarn', testRunner: 'vitest', e2eRunner: 'none', mutationRunner: 'none' };
    expect(commandsFor(stack).typecheck).toEqual(['yarn', 'tsc', '--noEmit']);
  });

  it('omits testE2e and mutation entirely when neither tool is detected', () => {
    const stack: Stack = { packageManager: 'pnpm', testRunner: 'vitest', e2eRunner: 'none', mutationRunner: 'none' };
    const cmd = commandsFor(stack);
    // No fabricated playwright/stryker command that would error on first run.
    expect('testE2e' in cmd).toBe(false);
    expect('mutation' in cmd).toBe(false);
  });

  it('emits mutation only when Stryker is present', () => {
    const withStryker: Stack = { packageManager: 'pnpm', testRunner: 'vitest', e2eRunner: 'none', mutationRunner: 'stryker' };
    expect(commandsFor(withStryker).mutation).toEqual(['pnpm', 'exec', 'stryker', 'run']);
  });
});

describe('detectMutationRunner', () => {
  it('detects Stryker from @stryker-mutator/core', () => {
    const root = tmp();
    writePkg(root, { devDependencies: { '@stryker-mutator/core': '^8.0.0' } });
    expect(detectStack(root).mutationRunner).toBe('stryker');
  });

  it('defaults to none with no Stryker signal', () => {
    const root = tmp();
    writePkg(root, { devDependencies: { vitest: '^2.0.0' } });
    expect(detectStack(root).mutationRunner).toBe('none');
  });
});
