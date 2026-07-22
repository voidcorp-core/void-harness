// Which certified capabilities are actually INSTALLED in a consumer project.
//
// The certification ships the full catalog (core + every pack). A project has
// only its activated packs, so treating every certified capability as installed
// (the old Phase-C stopgap) overstated the surface. Installed = core capabilities
// (always present) + capabilities whose pack the project activated.

/**
 * The pack directory a capability belongs to, or undefined for a core capability.
 * Capability ids are `type:pack-<x>/<name>` for packs and `type:<name>` for core
 * (e.g. `skill:pack-monorepo/service-package` -> `pack-monorepo`; `skill:tdd` ->
 * undefined).
 */
export function capabilityPackDir(id: string): string | undefined {
  const body = id.replace(/^[a-z]+:/, '');
  const slash = body.indexOf('/');
  return slash === -1 ? undefined : body.slice(0, slash);
}

/**
 * The subset of `capabilityIds` that count as installed for a project whose
 * activated packs map to `activatedPackDirs`. Core capabilities (no pack) are
 * always installed; a pack capability is installed only when its pack dir is in
 * the set.
 */
export function installedCapabilityIds(
  capabilityIds: readonly string[],
  activatedPackDirs: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const id of capabilityIds) {
    const dir = capabilityPackDir(id);
    if (dir === undefined || activatedPackDirs.has(dir)) out.add(id);
  }
  return out;
}
