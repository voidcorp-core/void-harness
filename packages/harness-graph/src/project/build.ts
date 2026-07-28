import type { GraphSnapshotV3 } from '../model/v3/types.js';
import type { ProjectCacheLoadResult } from './cache.js';
import type { ProjectBuildIssue } from './extractors/types.js';
import { indexProjectFiles, verifyIndexedProjectFiles } from './file-index.js';
import {
	publishProjectGraphCache,
	renderProjectGraph,
	type ProjectGraphBuildState,
} from './cache-publication.js';
import {
	prepareProjectBuild,
	projectBuildMetrics,
	type ProjectGraphBuildMetrics,
	type ProjectGraphBuildOptions,
} from './project-build-context.js';
import { collectProjectEvidence, type ProjectGraphSnapshotIdentity } from './project-evidence.js';

export type {
	ProjectGraphBuildMetrics,
	ProjectGraphBuildOptions,
} from './project-build-context.js';
export type { ProjectGraphSnapshotIdentity } from './project-evidence.js';

export interface ProjectGraphBuildResult {
	readonly graph: GraphSnapshotV3;
	readonly snapshot: ProjectGraphSnapshotIdentity;
	readonly state: ProjectGraphBuildState;
	readonly cacheStatus: ProjectCacheLoadResult['status'];
	readonly cachePublished: boolean;
	readonly issues: readonly ProjectBuildIssue[];
	readonly metrics: ProjectGraphBuildMetrics;
}

export async function buildProjectGraph(
	options: ProjectGraphBuildOptions,
): Promise<ProjectGraphBuildResult> {
	const context = await prepareProjectBuild(options);
	const entries = await indexProjectFiles(context);
	const evidence = await collectProjectEvidence(context, entries);
	if (context.observation.authority === 'advisory') {
		await verifyIndexedProjectFiles(context, entries);
	}
	const rendering = renderProjectGraph(context, evidence);
	const cachePublished = await publishProjectGraphCache(context, evidence, rendering);
	return Object.freeze({
		graph: rendering.graph,
		snapshot: evidence.snapshot,
		state: rendering.state,
		cacheStatus: context.cacheStatus,
		cachePublished,
		issues: Object.freeze(context.ledger.issues),
		metrics: projectBuildMetrics(context, entries.length),
	});
}
