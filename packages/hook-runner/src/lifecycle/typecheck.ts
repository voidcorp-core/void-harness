import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

export type TypecheckConfig =
  | { readonly argv: readonly string[] }
  | { readonly warning: string }
  | {};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function configuredTypecheck(value: unknown): TypecheckConfig {
  const root = record(value);
  const commands = record(root?.['commands']);
  const configured = commands?.['typecheck'];
  if (
    Array.isArray(configured)
    && configured.length > 0
    && configured.every((argument) => typeof argument === 'string')
  ) {
    return { argv: configured };
  }
  if (typeof configured === 'string') {
    return {
      warning: 'legacy commands.typecheck string ignored; migrate it to argv',
    };
  }
  return {};
}

function within(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function nearestTsconfigs(
  changedPaths: readonly string[],
  projectRoot: string,
  hasFile: (path: string) => boolean,
): string[] {
  const root = resolve(projectRoot);
  const found = new Set<string>();
  for (const changedPath of changedPaths) {
    if (!/\.(?:ts|tsx)$/.test(changedPath) || changedPath.endsWith('.d.ts')) continue;
    const target = resolve(root, changedPath);
    if (!within(root, target)) continue;
    let current = dirname(target);
    while (within(root, current)) {
      const config = join(current, 'tsconfig.json');
      if (hasFile(config)) {
        found.add(config);
        break;
      }
      if (current === root) break;
      current = dirname(current);
    }
  }
  return [...found];
}
