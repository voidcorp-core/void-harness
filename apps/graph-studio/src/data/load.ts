import type { GraphModel } from '@voidcorp/harness-graph';
import type { Finding } from '@voidcorp/harness-graph';
import model from '../generated/model.json' with { type: 'json' };
import findings from '../generated/findings.json' with { type: 'json' };
import usage from '../generated/usage-summary.json' with { type: 'json' };
import workflows from '../generated/workflows.json' with { type: 'json' };
import type { UsageSummary, WorkflowMeta } from './types.js';

export interface StudioData {
  readonly model: GraphModel;
  readonly findings: readonly Finding[];
  readonly usage: UsageSummary;
  readonly workflows: Record<string, WorkflowMeta>;
}

export function loadData(): StudioData {
  return {
    model: model as GraphModel,
    findings: findings as readonly Finding[],
    usage: usage as UsageSummary,
    workflows: workflows as Record<string, WorkflowMeta>,
  };
}
