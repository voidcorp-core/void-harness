import {
  isAbsolute,
  relative,
  resolve,
} from 'node:path';

const FORMATTABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$/;

function within(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function formatCandidates(
  touchedPaths: readonly string[],
  projectRoot: string,
): string[] {
  const root = resolve(projectRoot);
  const found = new Set<string>();
  for (const touchedPath of touchedPaths) {
    const target = resolve(root, touchedPath);
    if (
      touchedPath.trim() !== ''
      && FORMATTABLE.test(touchedPath.replaceAll('\\', '/'))
      && within(root, target)
    ) {
      found.add(target);
    }
  }
  return [...found];
}
