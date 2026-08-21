// `void-harness hydrate` — restore this project's harness assets, and prove it.
//
// `init` re-materializes; it does not promise the SAME bytes. `.void/config.json`
// pins a caret range and `init` writes whatever assets the running CLI carries,
// so two checkouts of one commit can hold different content with nothing saying
// so. `hydrate` closes that gap with two rules:
//
//   1. It refuses to run unless the CLI IS the version the manifest names. It
//      does not fetch that version — `npx` already selects versions, and doing it
//      here would add a network surface and a whole class of partial failures for
//      no gain. It prints the exact command instead.
//   2. It verifies every restored file against the manifest's hashes and exits
//      non-zero on any drift. "Hydrated" is a proof, not a claim.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  INSTALL_MANIFEST_PATH,
  type InstallManifest,
  type ManifestVerification,
  parseInstallManifest,
  verifyInstallManifest,
} from '../lib/install-manifest.js';
import { cliVersion } from '../lib/paths.js';
import { banner, blank, c, footer, glyph, line, meta } from '../lib/render.js';
import { init } from './init.js';

export interface HydratePlan {
  readonly kind: 'hydrate' | 'no-manifest' | 'unreadable-manifest' | 'version-mismatch';
  readonly message: string;
  readonly fix?: string;
}

/**
 * Decide what a hydrate run may do, from the manifest and the running version.
 * Pure, so the version guard is testable without a project on disk.
 */
export function planHydrate(
  manifestBody: string | undefined,
  runningVersion: string,
): HydratePlan {
  if (manifestBody === undefined) {
    return {
      kind: 'no-manifest',
      message: `no ${INSTALL_MANIFEST_PATH} — this project has never recorded what it expects`,
      fix: 'void-harness init (it writes the manifest), then commit it',
    };
  }
  const manifest = parseInstallManifest(manifestBody);
  if (manifest === undefined) {
    return {
      kind: 'unreadable-manifest',
      message: `${INSTALL_MANIFEST_PATH} is not a readable manifest`,
      fix: 'restore it from git, or re-run void-harness init to rewrite it',
    };
  }
  if (manifest.version !== runningVersion) {
    // Loudly, and never by substituting what happens to be installed: silently
    // hydrating with another version is the exact drift this command exists to
    // make impossible.
    return {
      kind: 'version-mismatch',
      message: `this project expects harness ${manifest.version}; you are running ${runningVersion}`,
      fix: `npx voidharness@${manifest.version} hydrate`,
    };
  }
  return { kind: 'hydrate', message: `manifest ${manifest.version}, ${manifest.files.length} file(s) to restore` };
}

/** Render a verification as the lines a reader needs, worst first. */
export function verificationLines(report: ManifestVerification): string[] {
  if (report.ok) {
    const proof = [`${report.verified} file(s) restored and hash-verified`];
    // Said out loud, because the proof line alone would be a small lie about
    // these: the manifest was re-stamped over what the project wrote, not found
    // matching. Not a warning — writing into a co-owned file is its purpose.
    if (report.coEditedTotal > 0) {
      proof.push(
        `${report.coEditedTotal} co-owned file(s) carry project edits, recorded as they are: `
        + `${report.coEdited.join(', ')}`,
      );
    }
    return proof;
  }
  const out: string[] = [];
  if (report.mismatchedTotal > 0) {
    out.push(`${report.mismatchedTotal} file(s) differ from the manifest:`);
    for (const path of report.mismatched) out.push(`  ${path}`);
    if (report.mismatchedTotal > report.mismatched.length) {
      out.push(`  … and ${report.mismatchedTotal - report.mismatched.length} more`);
    }
  }
  if (report.missingTotal > 0) {
    out.push(`${report.missingTotal} file(s) the restore did not produce:`);
    for (const path of report.missing) out.push(`  ${path}`);
    if (report.missingTotal > report.missing.length) {
      out.push(`  … and ${report.missingTotal - report.missing.length} more`);
    }
  }
  return out;
}

async function readManifestBody(root: string): Promise<string | undefined> {
  const path = join(root, ...INSTALL_MANIFEST_PATH.split('/'));
  if (!existsSync(path)) return undefined;
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

export async function hydrate(args: readonly string[]): Promise<void> {
  const root = process.cwd();
  const plan = planHydrate(await readManifestBody(root), cliVersion());

  banner('hydrate');
  meta('project', root);

  if (plan.kind !== 'hydrate') {
    blank();
    line(`${c.red('x')}  ${plan.message}`);
    if (plan.fix) line(c.dim(`     ${glyph.to} ${plan.fix}`));
    blank();
    process.exit(2);
  }

  meta('manifest', plan.message);
  blank();

  // Materialization is `init`'s job and stays there: one code path writes the
  // assets, so hydrate can never drift from what an install produces.
  await init(['--no-interactive', ...args.filter((arg) => arg !== '--verify-only')]);

  const body = await readManifestBody(root);
  const manifest = body === undefined ? undefined : parseInstallManifest(body);
  if (manifest === undefined) {
    blank();
    footer(c.red('the manifest became unreadable during hydrate — nothing was proven'));
    process.exit(2);
  }

  blank();
  const report = verifyInstallManifest(root, manifest);
  for (const text of verificationLines(report)) line(report.ok ? c.green(text) : c.yellow(text));
  blank();
  if (!report.ok) {
    // The usual cause is a harness asset edited by hand: the install transaction
    // refuses to overwrite a file it no longer owns, which is the right default.
    // Restoring it is a deliberate act, so it takes a deliberate flag.
    if (!args.includes('--force')) {
      line(c.dim(`     ${glyph.to} a harness asset was edited by hand; \`void-harness hydrate --force\` overwrites it with the manifest's version`));
    }
    blank();
    footer(c.red('hydrate could not prove the restore — the working tree does not match the manifest'));
    process.exit(1);
  }
  footer(c.green(`restored and proven against manifest ${manifest.version}`));
}

export type { InstallManifest };
