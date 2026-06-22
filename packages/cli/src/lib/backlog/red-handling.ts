// Adaptive red-ticket handling for a cluster (autoplan "best for the project"
// decision). When a ticket fails to reach green after a genuine effort, it is
// excluded from the cluster's integration PR — and so is anything that depends on
// it (its dependents can't ship without their prerequisite). If excluding the red
// set leaves nothing green, the red was a root the whole cluster depended on, so
// the cluster is blocked (no PR), branches preserved. Pure.

import type { OrderedTicket } from './cluster-order.js';

export interface RedHandling {
  /** Green tickets safe to integrate, sorted. */
  readonly included: readonly string[];
  /** Red tickets plus their transitive dependents, sorted. */
  readonly excluded: readonly string[];
  /** True when nothing green remains (the red was a depended-upon root). */
  readonly blockedCluster: boolean;
}

export function resolveRed(tickets: readonly OrderedTicket[], red: readonly string[]): RedHandling {
  const ids = new Set(tickets.map((t) => t.id));
  const excluded = new Set(red.filter((id) => ids.has(id)));

  // Propagate: a ticket that depends on an excluded ticket is itself excluded.
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tickets) {
      if (excluded.has(t.id)) continue;
      if (t.dependsOn.some((d) => excluded.has(d))) {
        excluded.add(t.id);
        changed = true;
      }
    }
  }

  const included = tickets.map((t) => t.id).filter((id) => !excluded.has(id)).sort();
  return {
    included,
    excluded: [...excluded].sort(),
    blockedCluster: included.length === 0,
  };
}
