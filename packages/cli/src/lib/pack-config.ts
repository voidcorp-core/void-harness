// Pure helpers over .void/config.json + the enabled-plugins set, shared by init,
// add, remove, and update. Extracted so the pack/pin policy has ONE source of
// truth: before this, `add` and `init` computed the "effective pin" with
// diverging precedence, and `add`/`remove` each re-implemented the enabled-names
// reconstruction. All functions are pure (no I/O) and unit-tested; the commands
// keep the fs read/write.

import { CORE_PLUGIN_NAME } from './packs.js';
import { compareVersions, normalizeVersion } from './version.js';

export type PackConfig = { core?: string; packs?: Record<string, string> } & Record<string, unknown>;

/**
 * The full set of enabled plugin NAMES (core always included, the `@marketplace`
 * suffix stripped), after applying add/remove deltas. `add` passes the newly
 * activated names; `remove` passes the dropped ones.
 */
export function enabledPluginNames(
  currentEnabled: Record<string, unknown>,
  delta: { add?: readonly string[]; remove?: readonly string[] } = {},
): string[] {
  const names = new Set<string>([CORE_PLUGIN_NAME]);
  for (const key of Object.keys(currentEnabled)) {
    if (currentEnabled[key] === true) {
      const [name] = key.split('@');
      if (name) names.add(name);
    }
  }
  for (const name of delta.add ?? []) names.add(name);
  for (const name of delta.remove ?? []) names.delete(name);
  return [...names];
}

/**
 * The version newly-activated packs pin to: the config's canonical pin (core's,
 * else any existing pack pin), else the resolved remote pin. `remotePin` is the
 * already-formatted range (e.g. `^0.17.0`) or undefined. NEVER a stale literal
 * (#67). Single source of the policy shared by init and add.
 */
export function resolveEffectivePin(config: PackConfig, remotePin?: string): string | undefined {
  return config.core ?? Object.values(config.packs ?? {})[0] ?? remotePin;
}

/**
 * Apply pack-pin deltas to a config, returning a NEW config. Added packs get
 * `pin` (skipped when undefined — activated in settings only); removed packs are
 * deleted from the packs map. Pure.
 */
export function withPackPins(
  config: PackConfig,
  delta: { addNames?: readonly string[]; removeNames?: readonly string[]; pin?: string },
): PackConfig {
  const packs = { ...(config.packs ?? {}) };
  if (delta.pin !== undefined) for (const name of delta.addNames ?? []) packs[`@voidcorp/${name}`] = delta.pin;
  for (const name of delta.removeNames ?? []) delete packs[`@voidcorp/${name}`];
  return { ...config, packs };
}

export interface PinBump {
  readonly name: string;
  readonly from: string;
  readonly to: string;
}

/**
 * Which pins move when the harness advances to `head`, and the resulting config.
 * Pure core of `update`'s `bumpPins` — the fs read/write + rendering stay in the
 * command. Bumps `core` and every pack pin that is not already at `head`.
 */
export function computePinBumps(config: PackConfig, head: string): { changes: PinBump[]; next: PackConfig } {
  const newPin = `^${head}`;
  const changes: PinBump[] = [];
  const nextPacks = { ...(config.packs ?? {}) };

  if (config.core !== undefined && compareVersions(normalizeVersion(config.core), head) !== 0) {
    changes.push({ name: CORE_PLUGIN_NAME, from: normalizeVersion(config.core), to: head });
  }
  for (const [key, declared] of Object.entries(config.packs ?? {})) {
    if (compareVersions(normalizeVersion(declared), head) !== 0) {
      changes.push({ name: key.replace(/^@voidcorp\//, ''), from: normalizeVersion(declared), to: head });
    }
    nextPacks[key] = newPin;
  }

  const next: PackConfig = { ...config, packs: nextPacks };
  if (config.core !== undefined) next.core = newPin;
  return { changes, next };
}
