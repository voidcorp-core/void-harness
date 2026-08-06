import type { GraphSnapshotV3 } from '../model/v3/types.js';
import { type ProjectCachePublication, sealProjectGraphCache } from './cache.js';
import { assembleProjectGraph, exceedsProjectGraphBudget } from './graph-assembly.js';
import {
	distinctProjectIssues,
	NON_DEGRADING_ISSUE_CODES,
	projectBuildIssue,
	projectPeakHeapDelta,
	sampleProjectHeap,
	type ProjectBuildContext,
	validateProjectRoot,
} from './project-build-context.js';
import type { ProjectBuildEvidence } from './project-evidence.js';

export type ProjectGraphBuildState = 'fresh' | 'degraded' | 'partial';

export interface ProjectGraphRendering {
	graph: GraphSnapshotV3;
	state: ProjectGraphBuildState;
	renderRootOnly: boolean;
}

function initialBuildState(context: ProjectBuildContext): ProjectGraphBuildState {
	// Only issues that put the graph's completeness in doubt decide the state. An
	// import whose specifier is not a literal is a bounded local unknown, reported
	// on its own file; letting it mark a whole project partial would make the word
	// mean "this project contains TypeScript" and cost it every use it has.
	const deciding = distinctProjectIssues(context.ledger.issues).filter(
		(entry) => !NON_DEGRADING_ISSUE_CODES.has(entry.code),
	);
	if (deciding.length === 0) return 'fresh';
	return deciding.every((entry) => entry.code === 'journal-unavailable') ? 'degraded' : 'partial';
}

function assembleRendering(
	context: ProjectBuildContext,
	evidence: ProjectBuildEvidence,
	state: ProjectGraphBuildState,
	renderRootOnly: boolean,
): GraphSnapshotV3 {
	return assembleProjectGraph(
		renderRootOnly ? [] : evidence.entries,
		renderRootOnly ? [] : evidence.tombstones,
		evidence.git,
		state,
		distinctProjectIssues(context.ledger.issues).length,
		context.projectRoot.caseSensitive,
		evidence.configsByPath,
		evidence.snapshot.id,
		context.compiler,
	);
}

function assembleWithEnvelopeFallback(
	context: ProjectBuildContext,
	evidence: ProjectBuildEvidence,
	state: ProjectGraphBuildState,
	renderRootOnly: boolean,
): ProjectGraphRendering {
	try {
		return {
			graph: assembleRendering(context, evidence, state, renderRootOnly),
			state,
			renderRootOnly,
		};
	} catch (error) {
		if (!(error instanceof Error) || !error.message.startsWith('GRAPH_V3_INVALID')) throw error;
		context.ledger.issues.push(
			error.message.includes('snapshot exceeds')
				? projectBuildIssue(
						'graph-limit',
						'.',
						'ProjectGraph serialized size exceeds the v3 envelope ceiling',
					)
				: projectBuildIssue(
						'invalid-source',
						'.',
						'Extractor output violates the Graph v3 envelope',
					),
		);
		return {
			graph: assembleRendering(context, evidence, 'partial', true),
			state: 'partial',
			renderRootOnly: true,
		};
	}
}

function applyMemoryLimit(
	context: ProjectBuildContext,
	evidence: ProjectBuildEvidence,
	rendering: ProjectGraphRendering,
): void {
	if (projectPeakHeapDelta(context) <= context.maxPeakHeapDeltaBytes) return;
	context.ledger.issues.push(
		projectBuildIssue('memory-limit', '.', 'ProjectGraph build exceeded its heap delta ceiling'),
	);
	rendering.state = 'partial';
	rendering.renderRootOnly = true;
	rendering.graph = assembleRendering(context, evidence, rendering.state, true);
}

export function renderProjectGraph(
	context: ProjectBuildContext,
	evidence: ProjectBuildEvidence,
): ProjectGraphRendering {
	const graphBudgetExceeded = exceedsProjectGraphBudget(
		evidence.entries,
		evidence.tombstones,
		evidence.git,
	);
	if (graphBudgetExceeded) {
		context.ledger.issues.push(
			projectBuildIssue(
				'graph-limit',
				'.',
				'ProjectGraph entity count exceeds the v3 envelope ceiling',
			),
		);
	}
	const state = initialBuildState(context);
	const unsafeEvidence = context.ledger.issues.some(
		(issue) => issue.code === 'concurrent-change' || issue.code === 'unsafe-root',
	);
	const rendering = assembleWithEnvelopeFallback(
		context,
		evidence,
		state,
		!context.ledger.rootStable || graphBudgetExceeded || unsafeEvidence,
	);
	sampleProjectHeap(context);
	applyMemoryLimit(context, evidence, rendering);
	return rendering;
}

async function validateFinalSnapshot(context: ProjectBuildContext): Promise<boolean> {
	if (!(await validateProjectRoot(context, 'before final snapshot observation'))) return false;
	const journalValidation = context.ledger.journalAvailable
		? await context.journal.validate(context.projectRoot, context.observation)
		: 'unavailable';
	if (journalValidation !== 'valid') {
		if (
			journalValidation === 'unavailable' &&
			!context.ledger.issues.some((entry) => entry.code === 'journal-unavailable')
		) {
			context.ledger.issues.push(
				projectBuildIssue(
					'journal-unavailable',
					'.',
					'project change watcher became unavailable during the build',
				),
			);
		} else if (
			journalValidation !== 'unavailable' &&
			!context.ledger.issues.some(
				(entry) => entry.code === 'concurrent-change' && entry.path === '.',
			)
		) {
			context.ledger.issues.push(
				projectBuildIssue(
					'concurrent-change',
					'.',
					'project journal generation changed during the build',
				),
			);
		}
		return false;
	}
	if (projectPeakHeapDelta(context) <= context.maxPeakHeapDeltaBytes) return true;
	if (!context.ledger.issues.some((entry) => entry.code === 'memory-limit')) {
		context.ledger.issues.push(
			projectBuildIssue('memory-limit', '.', 'ProjectGraph build exceeded its heap delta ceiling'),
		);
	}
	return false;
}

function memoizedFinalValidator(context: ProjectBuildContext): () => Promise<boolean> {
	let validation: Promise<boolean> | undefined;
	return () => {
		validation ??= validateFinalSnapshot(context);
		return validation;
	};
}

function renderPartial(
	context: ProjectBuildContext,
	evidence: ProjectBuildEvidence,
	rendering: ProjectGraphRendering,
): void {
	rendering.state = 'partial';
	rendering.renderRootOnly = true;
	rendering.graph = assembleRendering(context, evidence, rendering.state, true);
}

function cacheDraft(
	context: ProjectBuildContext,
	evidence: ProjectBuildEvidence,
	graph: GraphSnapshotV3,
) {
	return sealProjectGraphCache({
		schemaVersion: 1,
		rootKey: context.rootKey,
		extractionKey: context.extractionKey,
		snapshotId: evidence.snapshot.id,
		graphRootHash: graph.source.rootHash,
		gitHead: evidence.git.head,
		entries: Object.freeze(evidence.entries),
		tombstones: evidence.tombstones,
	});
}

async function handlePublicationError(
	context: ProjectBuildContext,
	evidence: ProjectBuildEvidence,
	rendering: ProjectGraphRendering,
	error: unknown,
	validate: () => Promise<boolean>,
): Promise<void> {
	const snapshotValid = await validate();
	const invalidEvidence = !snapshotValid || !context.ledger.rootStable;
	const issueCode =
		error instanceof Error && error.message.startsWith('PROJECT_CACHE_UNSAFE')
			? 'unsafe-cache'
			: 'cache-unavailable';
	context.ledger.issues.push(
		projectBuildIssue(
			issueCode,
			context.cachePath,
			error instanceof Error ? error.message : String(error),
		),
	);
	rendering.state = invalidEvidence || issueCode === 'unsafe-cache' ? 'partial' : 'degraded';
	if (invalidEvidence) rendering.renderRootOnly = true;
	else if (context.observation.kind === 'unchanged' && context.cacheStatus === 'ready') {
		context.journal.accept(context.projectRoot, context.observation);
	}
	rendering.graph = assembleRendering(context, evidence, rendering.state, rendering.renderRootOnly);
}

async function abortUnsettled(publication: ProjectCachePublication | undefined): Promise<void> {
	await publication?.abort().catch(() => undefined);
}

export async function publishProjectGraphCache(
	context: ProjectBuildContext,
	evidence: ProjectBuildEvidence,
	rendering: ProjectGraphRendering,
): Promise<boolean> {
	if (rendering.state !== 'fresh') return false;
	const validate = memoizedFinalValidator(context);
	let publication: ProjectCachePublication | undefined;
	let publicationSettled = false;
	try {
		publication = await context.cache.prepare(
			context.projectRoot,
			context.cachePath,
			cacheDraft(context, evidence, rendering.graph),
		);
		sampleProjectHeap(context);
		await publication.commit();
		const published = await publication.finalize(validate, () =>
			context.journal.accept(context.projectRoot, context.observation),
		);
		publicationSettled = true;
		if (published) return true;
		if (context.ledger.issues.length === 0) {
			context.ledger.issues.push(
				projectBuildIssue(
					'concurrent-change',
					'.',
					'cache publication rejected the final snapshot',
				),
			);
		}
		renderPartial(context, evidence, rendering);
	} catch (error) {
		if (!publicationSettled) await abortUnsettled(publication);
		await handlePublicationError(context, evidence, rendering, error, validate);
	}
	return false;
}
