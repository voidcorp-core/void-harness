import { mkdir, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureCompilerLookup } from './test-support.js';
import { describe, expect, it } from 'vitest';
import { buildProjectGraph } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import type { ProjectRootIdentity } from './extractors/types.js';
import {
	createNodeProjectChangeJournal,
	type ProjectChangeJournal,
	type ProjectWatchHandle,
	type ProjectWatchPort,
} from './journal.js';
import { createNodeProjectRootPort } from './root.js';

/**
 * Wait for an observation to satisfy `accept`, rather than for a fixed delay.
 *
 * `fs.watch` delivers asynchronously and on no schedule anyone controls. A
 * sleep long enough on an idle laptop is not long enough on a loaded CI runner,
 * and the failure it produces is indistinguishable from a real regression —
 * which is how a suite trains people to rerun instead of to read. Polling for
 * the condition is fast when the event is fast and patient when it is not.
 */
async function waitForObservation<T>(
	observe: () => Promise<T>,
	accept: (value: T) => boolean,
	timeoutMs = 5_000,
	stepMs = 10,
): Promise<{ readonly value: T; readonly satisfied: boolean }> {
	const deadline = Date.now() + timeoutMs;
	let value = await observe();
	while (!accept(value) && Date.now() < deadline) {
		await new Promise<void>((resolve) => setTimeout(resolve, stepMs));
		value = await observe();
	}
	return { value, satisfied: accept(value) };
}

function rootIdentity(path = '/project/root'): ProjectRootIdentity {
	return {
		path,
		device: 1,
		inode: 2,
		generation: {
			root: { device: '1', inode: '2' },
			parent: { path: '/project', device: '1', inode: '5' },
		},
		caseSensitive: true,
	};
}

function availableGitSnapshot() {
	return {
		head: 'a'.repeat(40),
		changed: [],
		deleted: [],
		renames: [],
		owners: {},
		availability: {
			head: 'available' as const,
			changes: 'available' as const,
			ownership: 'available' as const,
		},
		issues: [],
	};
}

async function expectUnavailableJournalBuild(
	root: string,
	journal: ProjectChangeJournal,
): Promise<void> {
	const result = await buildProjectGraph({
			compilerLookup: fixtureCompilerLookup(),
		root,
		journal,
		cache: createMemoryProjectCachePort(),
		git: { inspect: async () => availableGitSnapshot() },
	});
	expect(result.state).toBe('degraded');
	expect(result.cachePublished).toBe(false);
	expect(result.graph.nodes.length).toBeGreaterThan(1);
	expect(result.issues).toContainEqual(expect.objectContaining({ code: 'journal-unavailable' }));
}

function fakeWatchPort() {
	const subscriptions: {
		readonly path: string;
		readonly recursive: boolean;
		readonly event: (event: 'change' | 'rename', filename: string | undefined) => void;
		readonly error: () => void;
	}[] = [];
	let closed = 0;
	let unrefed = 0;
	const port: ProjectWatchPort = {
		watch(path, recursive, event, error): ProjectWatchHandle {
			subscriptions.push({ path, recursive, event, error });
			return {
				close: () => {
					closed += 1;
				},
				unref: () => {
					unrefed += 1;
				},
			};
		},
	};
	return {
		port,
		subscriptions,
		counts: () => ({ closed, unrefed }),
	};
}

describe('ProjectChangeJournal', () => {
	it('moves cold to unchanged and coalesces changed paths monotonically', async () => {
		const fake = fakeWatchPort();
		const journal = createNodeProjectChangeJournal({
			watchPort: fake.port,
			authority: 'authoritative',
		});
		const root = rootIdentity();
		const cold = await journal.observe(root);
		expect(cold).toEqual({
			kind: 'cold',
			authority: 'authoritative',
			generation: '0',
			rootGeneration: '0',
			paths: [],
		});
		expect(fake.counts().unrefed).toBe(2);
		expect(journal.accept(root, cold)).toBe(true);
		expect(await journal.observe(root)).toEqual({
			kind: 'unchanged',
			authority: 'authoritative',
			generation: '0',
			rootGeneration: '0',
			paths: [],
		});

		const tree = fake.subscriptions.find((entry) => entry.recursive);
		tree?.event('change', 'src/value.ts');
		tree?.event('change', 'src/value.ts');
		tree?.event('rename', 'src/new.ts');
		const changed = await journal.observe(root);

		expect(changed).toEqual({
			kind: 'changed',
			authority: 'authoritative',
			generation: '3',
			rootGeneration: '0',
			paths: ['src/new.ts', 'src/value.ts'],
		});
		expect(await journal.validate(root, changed)).toBe('valid');
		expect(journal.accept(root, changed)).toBe(true);
		expect(await journal.observe(root)).toEqual({
			kind: 'unchanged',
			authority: 'authoritative',
			generation: '3',
			rootGeneration: '0',
			paths: [],
		});
		journal.close();
		expect(fake.counts().closed).toBe(2);
	});
});

describe('ProjectChangeJournal failures', () => {
	it('keeps Node watching advisory unless a caller injects and trusts its watch port', async () => {
		const fake = fakeWatchPort();
		const advisory = createNodeProjectChangeJournal({ watchPort: fake.port });
		const native = createNodeProjectChangeJournal();

		expect((await advisory.observe(rootIdentity())).authority).toBe('advisory');
		expect((await native.observe(rootIdentity('/another/root'))).authority).toBe('advisory');
		expect(() => createNodeProjectChangeJournal({ authority: 'authoritative' })).toThrow(
			/authoritative authority requires an injected watchPort/,
		);
		advisory.close();
		native.close();
	});
});

describe('ProjectChangeJournal bounds', () => {
	it('marks missing filenames, watcher errors, and root-entry events uncertain', async () => {
		const fake = fakeWatchPort();
		const journal = createNodeProjectChangeJournal({ watchPort: fake.port });
		const root = rootIdentity();
		const cold = await journal.observe(root);
		expect(journal.accept(root, cold)).toBe(true);
		const tree = fake.subscriptions.find((entry) => entry.recursive);
		tree?.event('change', undefined);
		expect((await journal.observe(root)).kind).toBe('uncertain');
		const rebuilt = await journal.observe(root);
		expect(journal.accept(root, rebuilt)).toBe(true);

		const parent = fake.subscriptions.find((entry) => !entry.recursive);
		parent?.event('rename', 'sibling');
		expect((await journal.observe(root)).kind).toBe('unchanged');
		parent?.event('rename', 'root');
		expect((await journal.observe(root)).kind).toBe('uncertain');
		tree?.error();
		expect(await journal.validate(root, await journal.observe(root))).toBe('unavailable');
		expect(fake.counts().closed).toBe(2);
	});
});

describe('ProjectChangeJournal saturation', () => {
	it('turns a bounded path overflow into an explicit uncertain rebuild', async () => {
		const fake = fakeWatchPort();
		const journal = createNodeProjectChangeJournal({
			watchPort: fake.port,
			authority: 'authoritative',
			maxChangedPaths: 2,
		});
		const root = rootIdentity();
		const cold = await journal.observe(root);
		expect(journal.accept(root, cold)).toBe(true);
		const tree = fake.subscriptions.find((entry) => entry.recursive);
		tree?.event('change', 'a.ts');
		tree?.event('change', 'b.ts');
		for (let index = 0; index < 100; index += 1) {
			tree?.event('change', `${index}.ts`);
		}

		const saturated = await journal.observe(root);
		expect(saturated).toMatchObject({
			kind: 'uncertain',
			generation: '102',
			paths: [],
		});
		expect(journal.accept(root, saturated)).toBe(true);
		tree?.event('change', 'after-rebuild.ts');
		expect(await journal.observe(root)).toMatchObject({
			kind: 'changed',
			paths: ['after-rebuild.ts'],
		});
	});

	it('accepts only the exact observed generation and disposes a root explicitly', async () => {
		const fake = fakeWatchPort();
		const journal = createNodeProjectChangeJournal({ watchPort: fake.port });
		const root = rootIdentity();
		const cold = await journal.observe(root);
		const tree = fake.subscriptions.find((entry) => entry.recursive);
		tree?.event('change', 'src/late.ts');

		expect(journal.accept(root, cold)).toBe(false);
		expect((await journal.observe(root)).kind).toBe('cold');
		journal.dispose(root);
		expect(fake.counts().closed).toBe(2);
	});
});

describe('ProjectChangeJournal native capability', () => {
	it('proves native root ABA events or degrades when watching is unavailable', async () => {
		const parent = await mkdtemp(join(tmpdir(), 'void-project-journal-native-'));
		const root = join(parent, 'root');
		const saved = join(parent, 'saved');
		const replacement = join(parent, 'replacement');
		await mkdir(root);
		await mkdir(replacement);
		await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'journal-native' }));
		const rootPort = createNodeProjectRootPort();
		const identity = await rootPort.open(root);
		const journal = createNodeProjectChangeJournal();
		try {
			const initial = await journal.observe(identity);
			const capability = await journal.validate(identity, initial);
			if (capability === 'unavailable') {
				expect(['cold', 'uncertain']).toContain(initial.kind);
				await expectUnavailableJournalBuild(root, journal);
			} else {
				expect(capability).toBe('valid');
				expect(journal.accept(identity, initial)).toBe(true);
				await rename(root, saved);
				await rename(replacement, root);
				await rename(root, replacement);
				await rename(saved, root);
				const observed = await waitForObservation(
					() => journal.observe(identity),
					(candidate) => candidate.kind === 'uncertain',
				);
				const afterAba = observed.value;
				const postAbaCapability = await journal.validate(identity, afterAba);
				if (postAbaCapability === 'unavailable') {
					// A platform that cannot keep watching through the swap is a
					// legitimate outcome; it degrades and must not claim a clean build.
					await expectUnavailableJournalBuild(root, journal);
				} else {
					// Still watching, so the swap had to be noticed. Anything else is a
					// journal that kept reporting a root it no longer has.
					expect(observed.satisfied, `root swap went unnoticed; observed ${afterAba.kind}`).toBe(true);
					expect(afterAba.kind).toBe('uncertain');
					expect(postAbaCapability).toBe('valid');
					expect(afterAba.rootGeneration).not.toBe(initial.rootGeneration);
				}
			}
		} finally {
			journal.close();
		}
	});
});
