import type {
  NormalizedEdit,
  RuleVerdict,
} from '../enforcement/types.js';
import {
  evidenceVerdict,
  isGeneratedPath,
  isTestPath,
  normalizedPath,
} from './source-helpers.js';

export function boundaryDirection(edits: readonly NormalizedEdit[]): RuleVerdict {
  const evidence: string[] = [];
  for (const edit of edits) {
    const path = normalizedPath(edit.path);
    const match = path.match(/^packages\/([^/]+)\/.+\.(?:ts|tsx)$/);
    if (match === null || match[1] === 'core' || isTestPath(path) || isGeneratedPath(path)) continue;
    const sourcePackage = match[1];
    edit.addedContent.split(/\r?\n/).forEach((line, index) => {
      if (line.includes('allow-boundary:')) return;
      const target = line.match(/\bfrom\s+['"]@repo\/([A-Za-z0-9-]+)/)?.[1];
      if (target !== undefined && target !== 'core' && target !== sourcePackage) {
        evidence.push(`${path}:${index + 1} -> @repo/${target}`);
      }
    });
  }
  return evidenceVerdict(
    'MONOREPO_BOUNDARY_DIRECTION',
    'forbidden @repo/* import; package may import only itself or @repo/core',
    evidence,
  );
}
