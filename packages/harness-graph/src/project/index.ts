export type {
	ProjectGraphBuildMetrics,
	ProjectGraphBuildOptions,
	ProjectGraphBuildResult,
	ProjectGraphSnapshotIdentity,
} from './build.js';
export { buildProjectGraph } from './build.js';
export type {
	ProjectCacheLoadResult,
	ProjectCachePort,
	ProjectCachePublication,
	ProjectGraphCache,
	ProjectGraphCacheDraft,
	ProjectGraphCacheEntry,
	ProjectGraphRenameProof,
	ProjectGraphTombstone,
	ProjectMemoryCacheOptions,
} from './cache.js';
export {
	createMemoryProjectCachePort,
	createNodeProjectCachePort,
	defaultProjectCachePort,
	projectCacheRootKey,
	sealProjectGraphCache,
} from './cache.js';
export {
	classifyProjectFile,
	createNodeFileSystemPort,
	normalizeProjectPath,
	PROJECT_FILESYSTEM_HARD_LIMITS,
	validateProjectScanLimits,
} from './extractors/filesystem.js';
export type {
	ProjectGitCommand,
	ProjectGitCommandRunner,
} from './extractors/git.js';
export {
	createNodeGitPort,
	parseGitNameStatus,
	parseGitOwnership,
} from './extractors/git.js';
export type {
	ProjectBuildIssue,
	ProjectBuildIssueCode,
	ProjectCaseSensitivity,
	ProjectExtractor,
	ProjectFileExtraction,
	ProjectFileInput,
	ProjectFileKind,
	ProjectFileSystemPort,
	ProjectGitIssue,
	ProjectGitPort,
	ProjectGitRename,
	ProjectGitSnapshot,
	ProjectImport,
	ProjectInspectResult,
	ProjectPortableStatIdentity,
	ProjectReadResult,
	ProjectRootIdentity,
	ProjectRootPort,
	ProjectScannedFile,
	ProjectScanResult,
	ProjectSymbol,
	ProjectSymbolKind,
	ProjectWorkspace,
	TypeScriptConfig,
} from './extractors/types.js';
export {
	projectFileId,
	projectSymbolId,
} from './extractors/types.js';
export type {
	AdapterSelection,
	CompilerLookup,
	CompilerResolution,
	TypeScriptApi,
	TypeScriptModuleResolver,
} from './extractors/typescript.js';
export {
	createNodeCompilerLookup,
	createTypeScriptExtractor,
	createTypeScriptModuleResolver,
	parseTypeScriptConfig,
	resolveProjectCompiler,
	resolveTypeScriptConfigInheritance,
	resolveTypeScriptModule,
	selectCompilerAdapter,
} from './extractors/typescript.js';
export { extractPnpmWorkspace, extractWorkspaceManifest } from './extractors/workspace.js';
export type {
	ProjectChangeAuthority,
	ProjectChangeJournal,
	ProjectChangeKind,
	ProjectChangeObservation,
	ProjectChangeValidation,
	ProjectJournalOptions,
	ProjectWatchHandle,
	ProjectWatchPort,
} from './journal.js';
export { createNodeProjectChangeJournal } from './journal.js';
export type {
	ProjectKnowledgeArtifact,
	ProjectKnowledgeParseResult,
	ProjectKnowledgeState,
} from './knowledge.js';
export {
	assertProjectKnowledge,
	PROJECT_KNOWLEDGE_KIND,
	PROJECT_KNOWLEDGE_SCHEMA_VERSION,
	parseProjectKnowledge,
	serializeProjectKnowledge,
} from './knowledge.js';
export type {
	ExplainResult,
	ImpactResult,
	PathResult,
	ProjectGraphObservation,
	ProjectQueryAnswer,
	ProjectQueryBudget,
	StalenessResult,
	SubgraphResult,
} from './query.js';
export {
	DEFAULT_PROJECT_QUERY_BUDGET,
	explainNode,
	findPath,
	impactOf,
	ownersOf,
	stalenessOf,
	subgraphOf,
	testsFor,
} from './query.js';
export type {
	ProjectCaseProbeEntry,
	ProjectCaseProbeIdentity,
	ProjectCaseProbePort,
	ProjectRootOptions,
} from './root.js';
export { createNodeProjectRootPort, detectProjectVolumeCaseSensitivity } from './root.js';
