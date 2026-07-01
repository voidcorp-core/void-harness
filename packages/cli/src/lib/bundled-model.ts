import { filterByEnabledPacks, KERNEL_VERSION } from '@voidcorp/harness-graph';
import type { GraphModel } from '@voidcorp/harness-graph';
import { readEnabledPacks } from './enabled-packs.js';

/**
 * Baked full harness model, injected at bundle build time (Step 4). In the monorepo source it
 * is `undefined`, so `graph` scans the real source tree instead. When the CLI is bundled for a
 * consumer, the build replaces this with the serialized model.json string.
 */
export const BUNDLED_MODEL_JSON: string | undefined = undefined;

/**
 * Consumer path: parse the baked model and restrict it to the packs the consumer enabled.
 * No source scan, no monorepo paths — the model travels inside the bundle.
 */
export function resolveBundledModel(json: string, projectRoot: string): GraphModel {
  const model = JSON.parse(json) as GraphModel;
  const version = (model as { version: number }).version;
  if (version !== KERNEL_VERSION) {
    throw new Error(
      `bundled model version ${version} does not match kernel ${KERNEL_VERSION}; rebuild the void-graph bundle`,
    );
  }
  return filterByEnabledPacks(model, readEnabledPacks(projectRoot));
}
