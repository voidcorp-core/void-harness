export const KERNEL_VERSION = 1 as const;
export * from './model/types.js';
export { scanSourceTree } from './derive/nodes.js';
export { assembleModel, serializeModel } from './build-model.js';
export { analyze, blockingFindings, DETECTORS } from './analyze/index.js';
export type { Finding, Severity, AnalyzeCtx, Detector } from './analyze/types.js';
