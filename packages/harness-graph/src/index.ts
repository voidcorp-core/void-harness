export const KERNEL_VERSION = 1 as const;
export * from './model/types.js';
export { filterByEnabledPacks } from './model/filter.js';
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
export { parseOutcomes } from './outcome/parse.js';
export { analyzeOutcomes, outcomeKey, stoppedSessions } from './outcome/analyze.js';
export type { OutcomeEvent, ToolOutcome, SessionStop, OutcomeStatus, ComponentOutcome } from './outcome/types.js';
export { buildCertification, serializeCertification } from './certification/build.js';
export type {
  Certification,
  CapabilityCert,
  ProofRecord,
  EffectiveCell,
  EvalReportLite,
} from './certification/types.js';
export { computeProjectState } from './state/compute.js';
export type {
  ProjectState,
  CapabilityState,
  CapabilityStateName,
  RuntimeState,
  LocalSignals,
} from './state/types.js';
