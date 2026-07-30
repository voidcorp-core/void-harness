import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	buildProjectGraph,
	createMemoryProjectCachePort,
	createNodeCompilerLookup,
	createNodeProjectChangeJournal,
	createNodeProjectRootPort,
} from '../../dist/project/index.js';

// The benchmark fixture is a bare tree in the system temp directory: it resolves
// no compiler of its own and would measure a degraded build. Pointing the lookup
// at this repository keeps the measurement about extraction speed. Production
// never substitutes a compiler this way — see `compiler-host`.
const nodeLookup = createNodeCompilerLookup();
const compilerLookup = {
	resolve: () => nodeLookup.resolve(process.cwd()),
	load: (modulePath) => nodeLookup.load(modulePath),
};

const track = process.argv[2];
const scenario = process.argv[3];
if (!['deterministicJournalPort', 'nativeNodeJournal'].includes(track)) {
	throw new Error('benchmark track must be deterministicJournalPort or nativeNodeJournal');
}
if (!['cold', 'unchanged', 'sibling', 'changed-1', 'changed-9'].includes(scenario)) {
	throw new Error('benchmark scenario must be cold, unchanged, sibling, changed-1, or changed-9');
}

const fixture = fileURLToPath(
	new URL('../../src/project/test-fixtures/monorepo/', import.meta.url),
);
const files = [
	'packages/app/src/index.ts',
	'packages/app/src/index.specimen.ts',
	'packages/core/src/index.ts',
	'packages/core/src/secondary.ts',
	'packages/app/tsconfig.json',
	'packages/app/package.json',
	'packages/core/package.json',
	'package.json',
	'README.md',
	'pnpm-workspace.yaml',
	'tsconfig.base.json',
	'tsconfig.json',
];
const git = Object.freeze({
	inspect: async () =>
		Object.freeze({
			head: 'a'.repeat(40),
			changed: Object.freeze([]),
			deleted: Object.freeze([]),
			renames: Object.freeze([]),
			owners: Object.freeze({}),
			availability: Object.freeze({
				head: 'available',
				changes: 'available',
				ownership: 'available',
			}),
			issues: Object.freeze([]),
		}),
});

function createControlledJournal() {
	let generation = 0;
	let acceptedGeneration;
	let closed = false;
	const changedPaths = new Set();
	const eventEmission = { projectPaths: [], siblingEvents: 0 };
	const observe = () =>
		Object.freeze({
			kind:
				acceptedGeneration === undefined
					? 'cold'
					: generation === acceptedGeneration
						? 'unchanged'
						: 'changed',
			authority: 'authoritative',
			generation: String(generation),
			rootGeneration: '0',
			paths: Object.freeze([...changedPaths].sort()),
		});
	const journal = Object.freeze({
		observe: async () => observe(),
		validate: async (_root, observation) =>
			closed || observation.generation !== String(generation) ? 'changed' : 'valid',
		accept: (_root, observation) => {
			if (closed || observation.generation !== String(generation)) return false;
			acceptedGeneration = generation;
			changedPaths.clear();
			return true;
		},
		dispose: () => undefined,
		close: () => {
			closed = true;
		},
	});
	return Object.freeze({
		journal,
		eventEmission,
		emitProjectChanges(paths) {
			for (const path of paths) changedPaths.add(path);
			eventEmission.projectPaths.push(...paths);
			generation += 1;
		},
		emitSiblingActivity() {
			eventEmission.siblingEvents += 1;
		},
	});
}

const root = await mkdtemp(join(tmpdir(), 'void-project-benchmark-'));
const sibling = join(dirname(root), `${basename(root)}-sibling`);
const cache = createMemoryProjectCachePort();
const controlled = track === 'deterministicJournalPort' ? createControlledJournal() : undefined;
const journal = controlled?.journal ?? createNodeProjectChangeJournal();
const rootPort = createNodeProjectRootPort();
const probeCapability = async (identity) => {
	const observed = await journal.observe(identity);
	if ((await journal.validate(identity, observed)) === 'unavailable') return 'unavailable';
	return observed.authority;
};

try {
	await cp(fixture, root, { recursive: true });
	await mkdir(join(root, '.void', 'cache'), { recursive: true });
	const identity = await rootPort.open(root);
	const capabilitySequence =
		track === 'nativeNodeJournal' ? [await probeCapability(identity)] : undefined;
	globalThis.gc?.();
	let result = await buildProjectGraph({ root, git, cache, journal, compilerLookup });
	if (capabilitySequence !== undefined) capabilitySequence.push(await probeCapability(identity));
	const initialSnapshotId = result.snapshot.id;
	const initialRootHash = result.graph.source.rootHash;
	if (scenario !== 'cold') {
		const count = scenario === 'changed-9' ? 9 : scenario === 'changed-1' ? 1 : 0;
		const changedFiles = files.slice(0, count);
		for (const path of changedFiles) {
			const absolute = join(root, path);
			await writeFile(absolute, `${await readFile(absolute, 'utf8')}\n`);
		}
		if (changedFiles.length > 0) controlled?.emitProjectChanges(changedFiles);
		if (scenario === 'sibling') {
			await writeFile(sibling, 'sibling activity\n');
			controlled?.emitSiblingActivity();
		}
		globalThis.gc?.();
		result = await buildProjectGraph({ root, git, cache, journal, compilerLookup });
		if (capabilitySequence !== undefined) capabilitySequence.push(await probeCapability(identity));
	}
	const capabilities = capabilitySequence === undefined ? undefined : new Set(capabilitySequence);
	const nativeCapability =
		capabilities === undefined
			? undefined
			: capabilities.size === 1
				? capabilitySequence[0]
				: 'mixed';
	process.stdout.write(
		`${JSON.stringify({
			track,
			scenario,
			durationMs: result.metrics.durationMs,
			peakRssBytes: process.resourceUsage().maxRSS * 1024,
			state: result.state,
			cachePublished: result.cachePublished,
			issueCodes: result.issues.map((issue) => issue.code),
			...(nativeCapability === undefined ? {} : { nativeCapability, capabilitySequence }),
			...(controlled === undefined ? {} : { eventEmission: controlled.eventEmission }),
			stable:
				result.snapshot.id === initialSnapshotId &&
				result.graph.source.rootHash === initialRootHash,
			scannedFiles: result.metrics.scannedFiles,
			inspectedPaths: result.metrics.inspectedPaths,
			readFiles: result.metrics.readFiles,
			hashedFiles: result.metrics.hashedFiles,
			extractedFiles: result.metrics.extractedFiles,
		})}\n`,
	);
} finally {
	journal.close();
	await rm(root, { recursive: true, force: true });
	await rm(sibling, { force: true });
}
