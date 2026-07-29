import { execFile } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
	type CompilerLookup,
	createNodeCompilerLookup,
} from './extractors/compiler-host.js';
import { projectPathIsIgnored } from './extractors/filesystem.js';
import type { ProjectRootIdentity } from './extractors/types.js';
import type {
	ProjectChangeJournal,
	ProjectChangeObservation,
	ProjectChangeValidation,
} from './journal.js';

const run = promisify(execFile);

interface InspectedProject {
	readonly signature: string;
	readonly rootSignature: string;
	readonly records: ReadonlyMap<string, string>;
	readonly paths: readonly string[];
}

interface ExactJournalState {
	accepted: string | undefined;
	acceptedRecords: ReadonlyMap<string, string> | undefined;
	generation: bigint;
	observed: string;
	observedRecords: ReadonlyMap<string, string>;
	paths: readonly string[];
	rootGeneration: bigint;
	rootSignature: string;
}

function rootSignature(stats: Awaited<ReturnType<typeof lstat>>): string {
	return `${stats.dev}:${stats.ino}:${stats.isDirectory()}:${stats.isSymbolicLink()}`;
}

async function visitRecords(
	directory: string,
	prefix: string,
	records: Map<string, string>,
): Promise<void> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
		if (path === '.git' || path.startsWith('.git/') || projectPathIsIgnored(path)) continue;
		if (entry.isDirectory() && !entry.isSymbolicLink()) {
			await visitRecords(join(directory, entry.name), path, records);
		} else if (entry.isFile()) {
			records.set(path, await readFile(join(directory, entry.name), 'utf8'));
		} else {
			records.set(path, entry.isSymbolicLink() ? 'symlink' : 'other');
		}
	}
}

function contentSignature(records: ReadonlyMap<string, string>): string {
	return [...records]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([path, content]) => `${path}\0${content}`)
		.join('\0');
}

function statusPaths(status: string): readonly string[] {
	const records = status.split('\0').filter(Boolean);
	const paths: string[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (record === undefined) continue;
		const statusCode = record.slice(0, 2);
		paths.push(record.slice(3));
		if (statusCode.includes('R') || statusCode.includes('C')) {
			const origin = records[index + 1];
			if (origin !== undefined) paths.push(origin);
			index += 1;
		}
	}
	return Object.freeze(paths.filter((path) => !projectPathIsIgnored(path)).sort());
}

async function inspectGit(root: string): Promise<{
	readonly signature: string;
	readonly paths: readonly string[];
}> {
	const [head, status, diff] = await Promise.all([
		run('git', ['rev-parse', 'HEAD'], { cwd: root }).then((result) => result.stdout.trim()),
		run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root }).then(
			(result) => result.stdout,
		),
		run('git', ['diff', '--no-ext-diff', '--no-textconv', '--binary', '--', '.'], {
			cwd: root,
		}).then((result) => result.stdout),
	]);
	return Object.freeze({ signature: `${head}\0${status}\0${diff}`, paths: statusPaths(status) });
}

async function inspectProject(root: string): Promise<InspectedProject> {
	const stats = await lstat(root);
	const records = new Map<string, string>();
	if (stats.isDirectory() && !stats.isSymbolicLink()) await visitRecords(root, '', records);
	const files = contentSignature(records);
	try {
		const git = await inspectGit(root);
		return Object.freeze({
			signature: `${git.signature}\0${files}`,
			rootSignature: rootSignature(stats),
			records,
			paths: git.paths,
		});
	} catch {
		return Object.freeze({
			signature: files,
			rootSignature: rootSignature(stats),
			records,
			paths: Object.freeze([...records.keys()].sort()),
		});
	}
}

function changedPaths(state: ExactJournalState, current: InspectedProject): readonly string[] {
	const paths = new Set(current.paths);
	if (state.acceptedRecords !== undefined) {
		const candidates = new Set([...state.acceptedRecords.keys(), ...current.records.keys()]);
		for (const path of candidates) {
			if (state.acceptedRecords.get(path) !== current.records.get(path)) paths.add(path);
		}
	}
	return Object.freeze([...paths].sort());
}

function newState(current: InspectedProject): ExactJournalState {
	return {
		accepted: undefined,
		acceptedRecords: undefined,
		generation: 0n,
		observed: current.signature,
		observedRecords: current.records,
		paths: current.paths,
		rootGeneration: 0n,
		rootSignature: current.rootSignature,
	};
}

function exactObservation(
	state: ExactJournalState,
	kind: ProjectChangeObservation['kind'],
): ProjectChangeObservation {
	return Object.freeze({
		authority: 'authoritative',
		generation: state.generation.toString(),
		kind,
		paths: state.paths,
		rootGeneration: state.rootGeneration.toString(),
	});
}

class ExactProjectJournal implements ProjectChangeJournal {
	readonly #states = new Map<string, ExactJournalState>();

	async observe(root: ProjectRootIdentity): Promise<ProjectChangeObservation> {
		const current = await inspectProject(root.path);
		const state = this.#states.get(root.path);
		if (state === undefined) {
			const created = newState(current);
			this.#states.set(root.path, created);
			return exactObservation(created, 'cold');
		}
		if (state.observed !== current.signature) state.generation += 1n;
		if (state.rootSignature !== current.rootSignature) state.rootGeneration += 1n;
		state.observed = current.signature;
		state.observedRecords = current.records;
		state.rootSignature = current.rootSignature;
		state.paths = changedPaths(state, current);
		const kind =
			state.accepted === undefined
				? 'cold'
				: state.accepted === current.signature
					? 'unchanged'
					: 'changed';
		return exactObservation(state, kind);
	}

	async validate(
		root: ProjectRootIdentity,
		observed: ProjectChangeObservation,
	): Promise<ProjectChangeValidation> {
		const state = this.#states.get(root.path);
		const current = await inspectProject(root.path).catch(() => undefined);
		if (state === undefined || current === undefined) return 'unavailable';
		if (state.observed !== current.signature) {
			state.generation += 1n;
			state.observed = current.signature;
			state.observedRecords = current.records;
			state.paths = current.paths;
		}
		if (state.rootSignature !== current.rootSignature) {
			state.rootGeneration += 1n;
			state.rootSignature = current.rootSignature;
		}
		return state.generation.toString() === observed.generation ? 'valid' : 'changed';
	}

	accept(root: ProjectRootIdentity, observed: ProjectChangeObservation): boolean {
		const state = this.#states.get(root.path);
		if (state === undefined || state.generation.toString() !== observed.generation) return false;
		state.accepted = state.observed;
		state.acceptedRecords = state.observedRecords;
		return true;
	}

	dispose(root: ProjectRootIdentity): void {
		this.#states.delete(root.path);
	}

	close(): void {
		this.#states.clear();
	}
}

export function createExactProjectChangeJournal(): ProjectChangeJournal {
	return Object.freeze(new ExactProjectJournal());
}


/**
 * The compiler a fixture project is analysed with.
 *
 * Fixtures are throwaway trees with no `node_modules`, so they resolve no
 * compiler of their own and would every one of them build a partial snapshot.
 * Injecting this repository's compiler is what keeps those tests about the thing
 * they are testing. It is a TEST affordance on purpose: production never falls
 * back to the harness's compiler, which is the whole point of the port.
 */
export function fixtureCompilerLookup(): CompilerLookup {
	const node = createNodeCompilerLookup();
	return Object.freeze({
		resolve: () => node.resolve(process.cwd()),
		load: (modulePath: string) => node.load(modulePath),
	});
}
