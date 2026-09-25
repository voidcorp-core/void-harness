// tdd-cover: e2e test/cli/cheatsheet.test.ts
import type { CatalogEntry } from './catalog.js';
import type { Availability, LocalEvidence } from './availability.js';
import { PRODUCT_COMMAND } from '@voidcorp/hook-runner';

export interface CheatSheet {
  readonly schemaVersion: 1;
  readonly installation: LocalEvidence['installation'];
  readonly entries: readonly (CatalogEntry & { readonly availability: readonly Availability[] })[];
}
export const installationText = {
  absent: `No local installation was found. Browse the full catalogue below; run ${PRODUCT_COMMAND} init to install.`,
  installed: 'Local installation evidence found. Installed assets are distinct from effective runtime visibility and verified execution.',
  unknown: `Local installation evidence is incomplete, unreadable or invalid. Availability remains unknown; inspect the installation with ${PRODUCT_COMMAND} doctor.`,
};
