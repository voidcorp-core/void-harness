// Detect whether the CLI is being run *inside the void-machine source repo*
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
import { PRODUCT_COMMAND } from '@voidcorp/hook-runner';

/**
 * True when `root` is the void-machine source repo itself. Keyed on the root
 * package.json `name` (the private workspace root kept its original name through
 * the rename) **and** the `packages/{cli,core}` workspace layout, so a consumer
 * that merely vendors a `.void/` dir — or happens to share a name — is never
 * mistaken for the source. Any read/parse error resolves to `false`: an
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
      readonly command: string;
    };

/**
 * Route source checkouts to the executable self-host doctor. It validates the
 * generated receipt and current source hash instead of consumer root files.
 */
export function selfRepoDoctorTarget(root: string): SelfRepoDoctorTarget {
  if (!isHarnessSourceRepo(root)) return { kind: 'consumer' };
  return {
    kind: 'self-host',
    command: `${PRODUCT_COMMAND} self-host sync`,
  };
}
