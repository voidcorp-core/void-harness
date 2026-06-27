import type { GraphModel } from '../model/types.js';
import { brokenRoutes } from './broken-routes.js';
import { orphans } from './orphans.js';
import { overlap } from './overlap.js';
import { routingCycle } from './routing-cycle.js';
import { type AnalyzeCtx, type Detector, type Finding, isError } from './types.js';

export const DETECTORS: readonly Detector[] = [brokenRoutes, orphans, overlap, routingCycle];

const RANK: Record<Finding['severity'], number> = { error: 0, warning: 1, info: 2 };

export function analyze(model: GraphModel, ctx: AnalyzeCtx): Finding[] {
  return DETECTORS.flatMap((d) => d(model, ctx)).sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || a.kind.localeCompare(b.kind),
  );
}

export function blockingFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter(isError);
}

export * from './types.js';
