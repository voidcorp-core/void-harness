/**
 * A sparse checkout names the files a job may read, which is how the review jobs keep the pull
 * request's tree out of reach. It also means a script that starts importing a sibling, or reading
 * a data file, crashes in CI and only there: the job that posts the required review verdict then
 * never posts it, and every merge waits. This proves each listed script can reach everything it
 * loads from inside the same sparse set.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const WORKFLOWS = readdirSync(join(ROOT, '.github/workflows'))
  .filter((name) => name.endsWith('.yml'))
  .map((name) => `.github/workflows/${name}`);

// A static import or re-export, and a file read through `new URL(relative, import.meta.url)`.
const LOADS = [/\bfrom\s+'(\.\.?\/[^']+)'/g, /new URL\('(\.\.?\/[^']+)',\s*import\.meta\.url\)/g];

/** Each `sparse-checkout: |` block scalar, as its list of entries. */
function sparseSets(path: string): string[][] {
  const lines = readFileSync(join(ROOT, path), 'utf8').split('\n');
  const sets: string[][] = [];
  lines.forEach((line, index) => {
    const header = /^(\s*)sparse-checkout:\s*\|\s*$/.exec(line);
    if (header === null) return;
    const indent = (header[1] ?? '').length;
    const body: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (next.trim() !== '' && next.length - next.trimStart().length <= indent) break;
      if (next.trim() !== '') body.push(next.trim());
    }
    sets.push(body);
  });
  return sets;
}

function loadsOf(file: string): string[] {
  const source = readFileSync(join(ROOT, file), 'utf8');
  return LOADS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => normalize(join(dirname(file), match[1] ?? ''))));
}

/** Every repository file a script reaches, itself included, bounded by the tree it lives in. */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0 && seen.size < 200) {
    const file = pending.pop() ?? '';
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith('.mjs')) pending.push(...loadsOf(file));
  }
  return [...seen];
}

const covered = (file: string, set: readonly string[]) =>
  set.some((entry) => entry === file || file.startsWith(`${entry.replace(/\/$/, '')}/`));

describe('sparse checkouts that run a script', () => {
  const cases = WORKFLOWS.flatMap((path) =>
    sparseSets(path).map((set, index) => ({ label: `${path} #${index + 1}`, set })),
  );

  it('exist, so this proof is not vacuous', () => {
    expect(cases.length).toBeGreaterThanOrEqual(2);
  });

  it.each(cases)('$label holds every file its scripts load', ({ set }) => {
    const scripts = set.filter((entry) => entry.endsWith('.mjs'));
    const missing = scripts.flatMap(closure).filter((file) => !covered(file, set));
    expect([...new Set(missing)]).toEqual([]);
  });
});
