export const KERNEL_VERSION = 1 as const;
export * from './model/types.js';
export { scanSourceTree } from './derive/nodes.js';
export { assembleModel, serializeModel } from './build-model.js';
export { analyze, blockingFindings, DETECTORS } from './analyze/index.js';
export type { Finding, Severity, AnalyzeCtx, Detector } from './analyze/types.js';
export { analyzeBehavior } from './behavior/index.js';
export type { BehaviorOptions, BehaviorReport, BehaviorStats } from './behavior/index.js';
export { parseActivations, triggerMatches, globMatches } from './behavior/index.js';
export type { ActivationEvent, ActivationKind, ActivationTrigger, BehaviorFinding } from './behavior/types.js';
export { analyzeCost } from './cost/analyze.js';
export { DEFAULT_PRICING, deriveDollars, mergePricing } from './cost/pricing.js';
export type { PricingTable, ModelRates } from './cost/pricing.js';
export type {
  CostOptions,
  CostReport,
  CostRow,
  CostStats,
  CostFlag,
  SessionCost,
  SessionTokens,
  RealSignal,
} from './cost/types.js';
