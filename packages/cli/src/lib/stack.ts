// Detect the consumer project's stack (package manager + test runners) from
// the filesystem and package.json. Used by `init` to seed `.void/config.json`
// commands so consumers don't have to hand-edit `bunx` ↔ `pnpm exec`.
//
// Detection priority for the package manager:
//   1. `packageManager` field in root package.json (Corepack standard,
//      authoritative if present)
//   2. Lockfile presence (pnpm-lock.yaml, bun.lock(b), yarn.lock,
//      package-lock.json)
//   3. Workspace marker (pnpm-workspace.yaml ⇒ pnpm)
//   4. Fallback: bun (the void-harness opinionated default)

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';
export type TestRunner = 'vitest' | 'jest' | 'bun' | 'node';
export type E2ERunner = 'playwright' | 'cypress' | 'none';
export type MutationRunner = 'stryker' | 'none';

export interface Stack {
  readonly packageManager: PackageManager;
  readonly testRunner: TestRunner;
  readonly e2eRunner: E2ERunner;
  readonly mutationRunner: MutationRunner;
}

export interface StackCommands {
  readonly typecheck: readonly string[];
  readonly testUnit: readonly string[];
  // Only emitted when the corresponding tool is actually detected — inventing a
  // `playwright`/`stryker` command with no signal writes a config that fails the
  // first time it runs. Absent means "no such tool here", not "run the default".
  readonly testE2e?: readonly string[];
  readonly mutation?: readonly string[];
}

interface RootPkg {
  readonly packageManager?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

function readPkg(root: string): RootPkg | undefined {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RootPkg;
  } catch {
    return undefined;
  }
}

function allDeps(pkg: RootPkg | undefined): Record<string, string> {
  if (!pkg) return {};
  return {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
  };
}

export function detectPackageManager(root: string, pkg = readPkg(root)): PackageManager {
  // 1. Corepack `packageManager` field.
  if (pkg?.packageManager) {
    const name = pkg.packageManager.split('@')[0];
    if (name === 'pnpm' || name === 'bun' || name === 'yarn' || name === 'npm') return name;
  }
  // 2. Lockfile presence.
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb'))) return 'bun';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'package-lock.json'))) return 'npm';
  // 3. Workspace marker.
  if (existsSync(join(root, 'pnpm-workspace.yaml'))) return 'pnpm';
  // 4. Fallback.
  return 'bun';
}

export function detectTestRunner(root: string, pkg = readPkg(root)): TestRunner {
  const deps = allDeps(pkg);
  if (deps.vitest !== undefined) return 'vitest';
  if (deps.jest !== undefined || deps['@jest/core'] !== undefined) return 'jest';
  // bun test is built-in; no dep needed
  return 'vitest';
}

export function detectE2ERunner(root: string, pkg = readPkg(root)): E2ERunner {
  const deps = allDeps(pkg);
  if (deps['@playwright/test'] !== undefined || deps.playwright !== undefined) return 'playwright';
  if (deps.cypress !== undefined) return 'cypress';
  return 'none';
}

export function detectMutationRunner(root: string, pkg = readPkg(root)): MutationRunner {
  const deps = allDeps(pkg);
  if (deps['@stryker-mutator/core'] !== undefined || deps.stryker !== undefined) return 'stryker';
  return 'none';
}

export function detectStack(root: string): Stack {
  const pkg = readPkg(root);
  return {
    packageManager: detectPackageManager(root, pkg),
    testRunner: detectTestRunner(root, pkg),
    e2eRunner: detectE2ERunner(root, pkg),
    mutationRunner: detectMutationRunner(root, pkg),
  };
}

/** Map a package manager to its one-shot-binary launcher (npx-equivalent). */
function dlx(pm: PackageManager): readonly string[] {
  switch (pm) {
    case 'pnpm':
      return ['pnpm', 'exec'];
    case 'bun':
      return ['bunx'];
    case 'yarn':
      return ['yarn'];
    case 'npm':
      return ['npx'];
  }
}

/** Build the `.void/config.json` commands for a detected stack. */
export function commandsFor(stack: Stack): StackCommands {
  const dx = dlx(stack.packageManager);
  const typecheck = [...dx, 'tsc', '--noEmit'];

  let testUnit: readonly string[];
  if (stack.testRunner === 'vitest') testUnit = [...dx, 'vitest', 'run'];
  else if (stack.testRunner === 'jest') testUnit = [...dx, 'jest'];
  else if (stack.testRunner === 'bun') testUnit = ['bun', 'test'];
  else testUnit = [...dx, 'vitest', 'run'];

  // E2E + mutation commands are emitted ONLY on a real signal. No detected e2e
  // runner ⇒ no testE2e key; no Stryker in deps ⇒ no mutation key. The `.void`
  // An absent key is a clean no-op, far better than a fabricated
  // `playwright`/`stryker` command that errors on first run.
  let testE2e: readonly string[] | undefined;
  if (stack.e2eRunner === 'playwright') testE2e = [...dx, 'playwright', 'test'];
  else if (stack.e2eRunner === 'cypress') testE2e = [...dx, 'cypress', 'run'];

  const mutation = stack.mutationRunner === 'stryker'
    ? [...dx, 'stryker', 'run']
    : undefined;

  return {
    typecheck,
    testUnit,
    ...(testE2e !== undefined ? { testE2e } : {}),
    ...(mutation !== undefined ? { mutation } : {}),
  };
}
