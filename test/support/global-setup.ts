import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    readonly voidTestRunRoot: string;
  }
}

export default async function globalSetup(project: TestProject): Promise<() => Promise<void>> {
  const root = await mkdtemp(join(tmpdir(), 'void-harness-test-run-'));
  await Promise.all(
    ['home', 'tmp', 'void-global', 'cache', 'config'].map((name) =>
      mkdir(join(root, name), { recursive: true }),
    ),
  );
  project.provide('voidTestRunRoot', root);

  return async () => {
    await rm(root, { recursive: true, force: true });
  };
}
