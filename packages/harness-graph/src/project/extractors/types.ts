import { graphEntityId } from '../../model/v3/ids.js';

export type ProjectFileKind = 'source' | 'test' | 'doc' | 'config' | 'file';
export type ProjectCaseSensitivity = boolean | 'unknown';
export type ProjectSymbolKind =
	| 'class'
	| 'enum'
	| 'export'
	| 'function'
	| 'interface'
	| 'type'
	| 'variable';

export interface ProjectImport {
	readonly specifier: string;
	readonly dynamic: boolean;
}

export interface ProjectSymbol {
	readonly kind: ProjectSymbolKind;
	readonly name: string;
	readonly exported: boolean;
}

export interface ProjectWorkspace {
	readonly path: string;
	readonly name: string;
	readonly patterns: readonly string[];
	readonly dependencies: readonly string[];
	readonly entrypoints: readonly string[];
	readonly exports: Readonly<Record<string, readonly string[]>>;
}

export interface TypeScriptConfig {
	readonly path: string;
	readonly basePath: string;
	readonly options: Readonly<Record<string, unknown>>;
	readonly raw: Readonly<Record<string, unknown>>;
	readonly extendsPaths: readonly string[];
	readonly resolvedOptions?: Readonly<Record<string, unknown>>;
}

export interface ProjectFileInput {
	readonly path: string;
	readonly content: string;
	readonly hash: string;
	readonly kind: ProjectFileKind;
}

export interface ProjectFileExtraction {
	readonly imports: readonly ProjectImport[];
	readonly exports: readonly string[];
	readonly symbols: readonly ProjectSymbol[];
	readonly tests: readonly string[];
	/** The file could not be parsed as written: a defect in the source. */
	readonly diagnostics: readonly string[];
	/**
	 * Edges this analysis cannot determine from a valid file, such as an import
	 * whose specifier is a variable. Kept apart from `diagnostics` because the two
	 * demand opposite responses: one is a file to fix, the other is a limit of
	 * static analysis that no amount of fixing the file will remove.
	 */
	readonly unresolved: readonly string[];
	readonly workspace?: ProjectWorkspace;
	readonly typeScriptConfig?: TypeScriptConfig;
}

export interface ProjectExtractor {
	readonly id: string;
	readonly version: string;
	supports(path: string): boolean;
	extract(input: ProjectFileInput): ProjectFileExtraction;
}

export interface ProjectScannedFile {
	readonly path: string;
	readonly size: number;
	readonly mtimeMs: number;
	readonly ctimeMs?: number;
	readonly device?: number;
	readonly inode?: number;
}

export type ProjectBuildIssueCode =
	| 'binary-file'
	| 'cache-unavailable'
	| 'compiler-unavailable'
	| 'case-sensitivity-unknown'
	| 'concurrent-change'
	| 'byte-limit'
	| 'depth-limit'
	| 'directory-limit'
	| 'entry-limit'
	| 'file-limit'
	| 'git-unavailable'
	| 'invalid-source'
	| 'journal-unavailable'
	| 'memory-limit'
	| 'graph-limit'
	| 'oversized-file'
	| 'permission-denied'
	| 'symlink-skipped'
	| 'unresolved-import'
	| 'unsafe-cache'
	| 'unsafe-root'
	| 'unsafe-path';

export interface ProjectBuildIssue {
	readonly code: ProjectBuildIssueCode;
	readonly path: string;
	readonly message: string;
}

export interface ProjectScanResult {
	readonly files: readonly ProjectScannedFile[];
	readonly issues: readonly ProjectBuildIssue[];
}

export type ProjectReadResult =
	| { readonly ok: true; readonly content: string; readonly hash: string }
	| { readonly ok: false; readonly issue: ProjectBuildIssue };

export type ProjectInspectResult =
	| { readonly status: 'file'; readonly file: ProjectScannedFile }
	| { readonly status: 'directory' }
	| { readonly status: 'missing' }
	| { readonly status: 'issue'; readonly issue: ProjectBuildIssue };

export interface ProjectFileSystemPort {
	scan(
		root: string,
		limits: {
			readonly maxFiles: number;
			readonly maxFileBytes: number;
			readonly maxDirectories: number;
			readonly maxDepth: number;
			readonly maxTotalBytes: number;
		},
	): Promise<ProjectScanResult>;
	inspect?(root: string, path: string, maxFileBytes: number): Promise<ProjectInspectResult>;
	read(root: string, file: ProjectScannedFile, maxFileBytes: number): Promise<ProjectReadResult>;
}

export interface ProjectRootIdentity {
	readonly path: string;
	readonly device: number;
	readonly inode: number;
	readonly generation: {
		readonly root: ProjectPortableStatIdentity;
		readonly parent: ProjectPortableStatIdentity & { readonly path: string };
	};
	readonly caseSensitive: ProjectCaseSensitivity;
}

export interface ProjectPortableStatIdentity {
	readonly device: string;
	readonly inode: string;
}

export interface ProjectRootPort {
	open(root: string): Promise<ProjectRootIdentity>;
	validate(root: ProjectRootIdentity): Promise<boolean>;
}

export interface ProjectGitRename {
	readonly from: string;
	readonly to: string;
	readonly similarity: number;
	readonly proofHead?: string;
	readonly proofRef?: string;
}

export interface ProjectGitSnapshot {
	readonly head: string | null;
	readonly changed: readonly string[];
	readonly deleted: readonly string[];
	readonly renames: readonly ProjectGitRename[];
	readonly owners: Readonly<Record<string, string>>;
	readonly availability: {
		readonly head: 'available' | 'degraded';
		readonly changes: 'available' | 'degraded';
		readonly ownership: 'available' | 'degraded';
	};
	readonly issues: readonly ProjectGitIssue[];
}

export interface ProjectGitIssue {
	readonly operation: 'head' | 'changes' | 'ownership';
	readonly reason:
		| 'failed'
		| 'identity-mismatch'
		| 'invalid-output'
		| 'overflow'
		| 'timeout'
		| 'unavailable';
}

export interface ProjectGitPort {
	inspect(
		root: string,
		expectedRoot: ProjectRootIdentity,
		paths?: readonly string[],
		previousHead?: string | null,
		validateObservation?: () => Promise<boolean>,
	): Promise<ProjectGitSnapshot>;
}

export function projectFileId(path: string): string {
	return graphEntityId('project', 'file', path);
}

export function projectSymbolId(path: string, name: string): string {
	return graphEntityId('project', 'symbol', `${path}:${name}`);
}
