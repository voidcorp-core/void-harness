export { buildProjectGraph } from './build.js';
export type {
	ProjectGraphBuildMetrics,
	ProjectGraphBuildOptions,
	ProjectGraphBuildResult,
	ProjectGraphSnapshotIdentity,
} from './build.js';
export {
	createMemoryProjectCachePort,
	createNodeProjectCachePort,
	defaultProjectCachePort,
	projectCacheRootKey,
	sealProjectGraphCache,
} from './cache.js';
export type {
	ProjectCacheLoadResult,
	ProjectCachePort,
	ProjectCachePublication,
	ProjectGraphCache,
	ProjectGraphCacheDraft,
	ProjectGraphCacheEntry,
	ProjectMemoryCacheOptions,
	ProjectGraphRenameProof,
	ProjectGraphTombstone,
} from './cache.js';
export {
	classifyProjectFile,
	createNodeFileSystemPort,
	normalizeProjectPath,
	PROJECT_FILESYSTEM_HARD_LIMITS,
	validateProjectScanLimits,
} from './extractors/filesystem.js';
export {
	createNodeGitPort,
	parseGitNameStatus,
	parseGitOwnership,
} from './extractors/git.js';
export type {
	ProjectGitCommand,
	ProjectGitCommandRunner,
} from './extractors/git.js';
export {
	projectFileId,
	projectSymbolId,
} from './extractors/types.js';
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
	ProjectReadResult,
	ProjectPortableStatIdentity,
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
	createTypeScriptExtractor,
	createTypeScriptModuleResolver,
	parseTypeScriptConfig,
	resolveTypeScriptConfigInheritance,
	resolveTypeScriptModule,
} from './extractors/typescript.js';
export type { TypeScriptModuleResolver } from './extractors/typescript.js';
export { extractPnpmWorkspace, extractWorkspaceManifest } from './extractors/workspace.js';
export { createNodeProjectChangeJournal } from './journal.js';
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
export { createNodeProjectRootPort, detectProjectVolumeCaseSensitivity } from './root.js';
export type {
	ProjectCaseProbeEntry,
	ProjectCaseProbeIdentity,
	ProjectCaseProbePort,
	ProjectRootOptions,
} from './root.js';
