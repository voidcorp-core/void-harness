export { createTypeScriptExtractor } from './typescript-extractor.js';
export {
	parseTypeScriptConfig,
	resolveTypeScriptConfigInheritance,
} from './typescript-config.js';
export {
	createTypeScriptModuleResolver,
	resolveTypeScriptModule,
} from './typescript-resolver.js';
export type { TypeScriptModuleResolver } from './typescript-resolver.js';
export type { ProjectCaseSensitivity } from './types.js';
export {
	createNodeCompilerLookup,
	resolveProjectCompiler,
	selectCompilerAdapter,
} from './compiler-host.js';
export type {
	AdapterSelection,
	CompilerLookup,
	CompilerResolution,
	TypeScriptApi,
} from './compiler-host.js';
