import { filterByEnabledPacks, KERNEL_VERSION } from '@voidcorp/harness-graph';
import type { GraphModel } from '@voidcorp/harness-graph';
import { readEnabledPacks } from './enabled-packs.js';

// Replaced by the bundle build via esbuild `define`. Undeclared at runtime in the monorepo
// source, so `typeof` (which never throws on an undeclared identifier) yields 'undefined' there.
declare const __VOID_BUNDLED_MODEL__: string;

/**
 * Baked full harness model. In the monorepo source it is `undefined`, so `graph` scans the real
 * source tree instead. When the CLI is bundled for a consumer, `buildVoidGraphBundle` injects the
 * serialized model.json here via the `__VOID_BUNDLED_MODEL__` define.
 */
export const BUNDLED_MODEL_JSON: string | undefined =
  typeof __VOID_BUNDLED_MODEL__ === 'string' ? __VOID_BUNDLED_MODEL__ : undefined;

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
