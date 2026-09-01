/**
 * A mechanism nobody calls is not a mechanism.
 *
 * Twenty-seven exported functions under `lib/autopilot` were unreachable from
 * any command: `judgeMergeGrant`, which decides whether a machine may merge;
 * `verifyRange`, which checks a branch against what git actually holds;
 * `planWorktreeSetup`, which decides where a worker may write. Each was
 * complete, tested, and reached only by its own test — because the procedure
 * that would have called them was a paragraph in a skill, and a paragraph
 * cannot be shown to have run.
 *
 * The measurement that found them is this one, and it stays. Deleting a caller
 * now turns a live guard back into decoration, silently, and nothing else in
 * this repository would notice.
 *
 * Reachability, not mere reference: the walk starts at the commands and follows
 * imports, so a function called only by other dead code stays dead. It is a
 * name-level approximation of a call graph — good enough to have found all
 * twenty-seven, and it says so rather than pretending to be a compiler.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'cli', 'src');

/** Every production TypeScript file under the CLI; tests are not callers. */
function productionFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return entry.isFile() && path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

const files = productionFiles(SRC);
const source = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));

/** Relative import specifiers resolved back to the files on disk. */
function importsOf(file: string): readonly string[] {
  const text = source.get(file) ?? '';
  const found: string[] = [];
  for (const match of text.matchAll(/from\s+'(\.[^']+)'/g)) {
    const specifier = (match[1] ?? '').replace(/\.js$/, '.ts');
    const resolved = resolve(dirname(file), specifier);
    if (source.has(resolved)) found.push(resolved);
  }
  return found;
}

/** Files the CLI can actually reach, walking imports from every command. */
function reachableFiles(): ReadonlySet<string> {
  const reached = new Set<string>();
  const queue = files.filter((file) => file.includes(`${join('src', 'commands')}`) || file.endsWith(`${join('src', 'main.ts')}`));
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || reached.has(file)) continue;
    reached.add(file);
    queue.push(...importsOf(file));
  }
  return reached;
}

const reached = reachableFiles();

/** Exported autopilot functions no reachable file mentions. */
function unreachableExports(): readonly string[] {
  const orphans: string[] = [];
  for (const file of files.filter((candidate) => candidate.includes(join('lib', 'autopilot')))) {
    const text = source.get(file) ?? '';
    for (const match of text.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)/gm)) {
      const name = match[1] ?? '';
      const named = new RegExp(`\\b${name}\\b`);
      const elsewhere = [...reached].some((other) => other !== file && named.test(source.get(other) ?? ''));
      // Used further down its own module counts, as long as that module is
      // itself reachable: `readProgramDescriptor` calls `parseProgramDescriptor`
      // three lines below it.
      const withinOwn = (text.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length > 1 && reached.has(file);
      if (!elsewhere && !withinOwn) orphans.push(`${file.replace(`${SRC}/`, '')}: ${name}`);
    }
  }
  return orphans;
}

describe('every declared autopilot mechanism has a caller', () => {
  it('names no exported function the CLI cannot reach', () => {
    expect(unreachableExports()).toEqual([]);
  });

  // The control. A walk that reached nothing would pass the assertion above by
  // finding no exports at all, which is the failure mode of every graph test.
  it('reaches the commands it starts from, and the library they use', () => {
    expect(reached.size).toBeGreaterThan(files.length / 2);
    expect([...reached].some((file) => file.includes(join('lib', 'autopilot', 'union-review')))).toBe(true);
  });
});
