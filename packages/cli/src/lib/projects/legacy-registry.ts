import { lstat, readdir, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const MAX_POINTERS_PER_RUN = 10_000;

export interface RetireLegacyProjectRegistryOptions {
  readonly globalDir: string;
  readonly limit: number;
  readonly dryRun?: boolean;
}

export interface LegacyProjectRegistryRetirement {
  readonly found: number;
  readonly removed: number;
  readonly remaining: number;
}

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function within(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

/** Retire only pointer files from the exact obsolete registry, never its directory. */
export async function retireLegacyProjectRegistry(
  options: RetireLegacyProjectRegistryOptions,
): Promise<LegacyProjectRegistryRetirement> {
  if (
    !Number.isInteger(options.limit)
    || options.limit < 1
    || options.limit > MAX_POINTERS_PER_RUN
  ) {
    throw new Error(`LEGACY_PROJECT_REGISTRY_LIMIT: expected 1..${MAX_POINTERS_PER_RUN}`);
  }

  const base = resolve(options.globalDir);
  const registry = join(base, 'projects');
  let registryInfo: Awaited<ReturnType<typeof lstat>>;
  try {
    registryInfo = await lstat(registry);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { found: 0, removed: 0, remaining: 0 };
    throw error;
  }
  if (!registryInfo.isDirectory() || registryInfo.isSymbolicLink()) {
    throw new Error('LEGACY_PROJECT_REGISTRY_UNSAFE: projects must be a real directory');
  }

  const [canonicalBase, canonicalRegistry] = await Promise.all([
    realpath(base),
    realpath(registry),
  ]);
  if (!within(canonicalBase, canonicalRegistry)) {
    throw new Error('LEGACY_PROJECT_REGISTRY_UNSAFE: projects resolves outside global dir');
  }

  const candidates: string[] = [];
  for (const entry of await readdir(registry, { withFileTypes: true })) {
    if (entry.name.endsWith('.path') && entry.isFile() && !entry.isSymbolicLink()) {
      candidates.push(entry.name);
    }
  }
  candidates.sort();
  const selected = candidates.slice(0, options.limit);
  if (options.dryRun !== true) {
    for (const name of selected) await unlink(join(registry, name));
  }
  const removed = options.dryRun === true ? 0 : selected.length;
  return {
    found: candidates.length,
    removed,
    remaining: candidates.length - removed,
  };
}
