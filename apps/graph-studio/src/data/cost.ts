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

/** Human-readable cost lines for a node's panel. Real columns appear only in full mode. */
export function formatCostLines(row: CostRow): string[] {
  const lines = [`invocations: ${row.invocations}`, `static tokens: ${row.staticTokens}`];
  const real = row.realSignal;
  if (real !== undefined) {
    const t = real.tokens;
    lines.push(`real tokens: ${t.in + t.out + t.cacheRead + t.cacheCreation}`);
    if (real.dollars !== undefined) lines.push(`$/session: ${real.dollars.toFixed(2)}`);
  }
  if (row.cacheReadRatio !== undefined) lines.push(`cache read: ${Math.round(row.cacheReadRatio * 100)}%`);
  if (row.flags.length > 0) lines.push(`flags: ${row.flags.join(', ')}`);
  return lines;
}
