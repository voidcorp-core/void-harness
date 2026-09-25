import { loadCatalog } from '../lib/cheatsheet/load.js';
import { availability, readLocalEvidence } from '../lib/cheatsheet/availability.js';
import { resolveProjectRoots } from '../lib/project-roots.js';
import { renderDocument, type CheatSheet } from '../lib/cheatsheet/render.js';
import { discoverProjectRoot, PRODUCT_COMMAND, PRODUCT_IDENTITY } from '@voidcorp/hook-runner';

export async function cheatsheet(args: readonly string[]): Promise<void> {
  const format = args.length === 0 ? 'html' : args.length === 2 && args[0] === '--format' ? args[1] : undefined;
  if (format !== 'json' && format !== 'html' && format !== 'markdown') {
    process.stderr.write(`Usage: ${PRODUCT_COMMAND} cheatsheet [--format html|markdown|json]\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const entries = await loadCatalog();
    const { installRoot } = resolveProjectRoots(discoverProjectRoot(process.cwd()));
    const evidence = await readLocalEvidence(installRoot, entries);
    const document: CheatSheet = {
      schemaVersion: 1, installation: evidence.installation,
      entries: entries.map(entry => ({ ...entry, availability: availability(entry, evidence) })),
    };
    process.stdout.write(renderDocument(document, format));
  } catch {
    process.stderr.write(`CHEATSHEET_CATALOG_INVALID: bundled discovery data is unavailable or invalid. Reinstall ${PRODUCT_IDENTITY.packageName}.\n`);
    process.exitCode = 1;
  }
}
