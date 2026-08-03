// Cross-package imports, judged against what the package actually declares.
//
// The old rule was "a package may import only itself or @repo/core" — a star
// topology, hardcoded, that no project ever wrote down. It is right for some
// monorepos and wrong for most: a package that legitimately depends on
// @repo/db was blocked, and the only way out was an `allow-boundary:` comment
// on every line. A rule whose normal use is being suppressed is not a rule.
//
// The topology is already declared, in the place a package manager reads it:
// the package's own `package.json`. An import of `@repo/db` from a package that
// depends on `@repo/db` is legitimate by construction. What stays worth
// blocking is an import of something the package does NOT declare — a phantom
// dependency, which builds today only because a sibling hoisted it into
// node_modules and breaks the moment it stops.
//
// So the rule got both narrower and more useful: it no longer invents a
// boundary, and it now catches something real.
//
// When the manifest cannot be found or read, the rule allows. A hook that
// blocks on what it could not determine turns every unusual layout into a wall.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

const IMPORT = /\bfrom\s+['"](@[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+)/;

interface Manifest {
  readonly name?: string;
  readonly declared: ReadonlySet<string>;
}

/** The nearest `package.json` at or above a file, without leaving the project. */
function nearestManifest(projectRoot: string, filePath: string): Manifest | undefined {
  const root = resolve(projectRoot);
  let directory = dirname(resolve(projectRoot, filePath));
  while (directory.startsWith(root)) {
    const candidate = join(directory, 'package.json');
    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as {
          name?: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
          optionalDependencies?: Record<string, string>;
        };
        return {
          ...(parsed.name === undefined ? {} : { name: parsed.name }),
          declared: new Set([
            ...Object.keys(parsed.dependencies ?? {}),
            ...Object.keys(parsed.devDependencies ?? {}),
            ...Object.keys(parsed.peerDependencies ?? {}),
            ...Object.keys(parsed.optionalDependencies ?? {}),
          ]),
        };
      } catch {
        // A manifest we cannot parse tells us nothing about the topology.
        return undefined;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

export function boundaryDirection(
  edits: readonly NormalizedEdit[],
  projectRoot?: string,
): RuleVerdict {
  const evidence: string[] = [];
  if (projectRoot !== undefined) {
    const manifests = new Map<string, Manifest | undefined>();
    for (const edit of edits) {
      const path = normalizedPath(edit.path);
      if (!/\.(?:ts|tsx|js|jsx)$/.test(path) || isTestPath(path) || isGeneratedPath(path)) continue;
      if (!manifests.has(path)) manifests.set(path, nearestManifest(projectRoot, path));
      const manifest = manifests.get(path);
      if (manifest === undefined) continue;
      edit.addedContent.split(/\r?\n/).forEach((line, index) => {
        if (line.includes('allow-boundary:')) return;
        const target = line.match(IMPORT)?.[1];
        if (target === undefined || target === manifest.name) return;
        if (manifest.declared.has(target)) return;
        evidence.push(`${path}:${index + 1} -> ${target}`);
      });
    }
  }
  return evidenceVerdict(
    'MONOREPO_UNDECLARED_DEPENDENCY',
    'imports a workspace package this one does not declare; add it to package.json dependencies',
    evidence,
  );
}
