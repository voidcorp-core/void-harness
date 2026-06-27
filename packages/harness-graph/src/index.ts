export const KERNEL_VERSION = 1 as const;
export * from './model/types.js';
export { scanSourceTree } from './derive/nodes.js';
export { assembleModel, serializeModel } from './build-model.js';
