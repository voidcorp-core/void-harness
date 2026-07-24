// Detect whether the CLI is being run *inside the void-harness source repo*
// (the meta-repo that produces the harness) rather than a project consuming it.
//
// `init` and `doctor` target consumers. Run against the source they misbehave:
//   - `init` would overwrite the canonical CLAUDE.md / AGENTS.md and drop
//     doctrine files at the repo root, corrupting the source of truth.
//   - `doctor` reports a wall of "missing" consumer artifacts that have no
//     reason to exist here, reading as a broken install when nothing is wrong.
//
// Both commands call this to bail out (or hard-guard) early.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * True when `root` is the void-harness source repo itself. Keyed on the root
 * package.json `name` **and** the `packages/{cli,core}` workspace layout, so a
 * consumer that merely vendors a `.void/` dir — or happens to share a name — is
 * never mistaken for the source. Any read/parse error resolves to `false`: an
 * unreadable root can't be the source repo we're protecting.
 */
export function isHarnessSourceRepo(root: string): boolean {
  try {
    const pkgPath = join(root, 'package.json');
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: unknown };
    if (pkg.name !== 'void-harness') return false;
    return existsSync(join(root, 'packages', 'cli')) && existsSync(join(root, 'packages', 'core'));
  } catch {
    return false;
  }
}

export type SelfRepoDoctorTarget =
  | { readonly kind: 'consumer' }
  | {
      readonly kind: 'self-host';
      readonly state: 'not-installed';
      readonly command: 'void-harness self-host sync';
    };

/**
 * Route doctor without pretending that a source checkout is healthy. The
 * executable self-host receipt lands in Step 8; until then the only honest
 * source-repo state is `not-installed`.
 */
export function selfRepoDoctorTarget(root: string): SelfRepoDoctorTarget {
  if (!isHarnessSourceRepo(root)) return { kind: 'consumer' };
  return {
    kind: 'self-host',
    state: 'not-installed',
    command: 'void-harness self-host sync',
  };
}
