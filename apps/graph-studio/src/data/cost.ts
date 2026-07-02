import type { CostReport, CostRow } from '@voidcorp/harness-graph';

/**
 * Index a CostReport's rows by nodeId for O(1) lookup in the renderer and panel. Tolerant to an
 * absent report (no cost produced) — returns an empty map so callers degrade cleanly.
 */
export function indexCost(report: CostReport | undefined): Map<string, CostRow> {
  const index = new Map<string, CostRow>();
  if (report === undefined) return index;
  for (const row of report.rows) index.set(row.nodeId, row);
  return index;
}
