import { mkdir, rename, stat, writeFile } from 'node:fs/promises';

import { join } from 'node:path';
import { cleanupProjectTempDirs, fixtureCompilerLookup, projectTempDir } from './test-support.js';
import { afterAll, describe, expect, it } from 'vitest';
import { buildProjectGraph } from './build.js';
import { createMemoryProjectCachePort } from './cache.js';
import type { ProjectRootIdentity } from './extractors/types.js';
import {
	createNodeProjectChangeJournal,
	PROJECT_JOURNAL_ANCHOR_PREFIX,
	type ProjectChangeJournal,
	type ProjectChangeObservation,
	type ProjectChangeValidation,
	type ProjectWatchHandle,
	type ProjectWatchAnchor,
	type ProjectWatchPort,
} from './journal.js';
import { createNodeProjectRootPort } from './root.js';

afterAll(cleanupProjectTempDirs);

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

/**
 * Observe until `validate` stops answering 'changed'.
 *
 * 'changed' is not a defect: it means an event landed between the observation
 * and the check, which is routine while a freshly written fixture settles. A
 * caller reacts by taking the newer observation, so the test does the same
 * instead of asserting that nothing ever arrives late.
 */
async function settleCapability(
	journal: ProjectChangeJournal,
	identity: ProjectRootIdentity,
	timeoutMs = 5_000,
): Promise<{ readonly observation: ProjectChangeObservation; readonly capability: ProjectChangeValidation }> {
	const deadline = Date.now() + timeoutMs;
	let observation = await journal.observe(identity);
	let capability = await journal.validate(identity, observation);
	while (capability === 'changed' && Date.now() < deadline) {
		journal.accept(identity, observation);
		observation = await journal.observe(identity);
		capability = await journal.validate(identity, observation);
	}
	return { observation, capability };
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
	const nodeRoot = createNodeProjectRootPort();
	const result = await buildProjectGraph({
		compilerLookup: fixtureCompilerLookup(),
		root,
		journal,
		cache: createMemoryProjectCachePort(),
		git: { inspect: async () => availableGitSnapshot() },
		rootPort: {
			async open(path) {
				return Object.freeze({ ...(await nodeRoot.open(path)), caseSensitive: false });
			},
			validate: (identity) => nodeRoot.validate(identity),
		},
	});
	expect(result.issues.map((issue) => issue.code)).toEqual(['journal-unavailable']);
	expect(result.state).toBe('degraded');
	expect(result.cachePublished).toBe(false);
	expect(result.graph.nodes.length).toBeGreaterThan(1);
	expect(result.issues).toContainEqual(expect.objectContaining({ code: 'journal-unavailable' }));
}

interface FakeWatchOptions {
	/**
	 * What the sentinel does, which is the only thing that separates a stream a
	 * caller has caught up with from one it merely hopes is quiet.
	 *
	 * `deliver` behaves like a filesystem: the sentinel's own event arrives, after
	 * whatever was already in flight. `silent` writes the sentinel and never
	 * reports it, the shape of a volume that does not notify. `refuse` cannot
	 * write it at all, the shape of a read-only tree.
	 */
	readonly sentinel?: 'deliver' | 'silent' | 'refuse';
	/** Events already in flight when the sentinel is placed. */
	readonly inFlight?: readonly string[];
}

function fakeWatchPort(options: FakeWatchOptions = {}) {
	const subscriptions: {
		readonly path: string;
		readonly recursive: boolean;
		readonly event: (event: 'change' | 'rename', filename: string | undefined) => void;
		readonly error: () => void;
	}[] = [];
	let closed = 0;
	let unrefed = 0;
	let released = 0;
	let sentinels = 0;
	const behaviour = options.sentinel ?? 'deliver';
	let inFlight: readonly string[] = options.inFlight ?? [];
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
		async anchor(): Promise<ProjectWatchAnchor | undefined> {
			if (behaviour === 'refuse') return undefined;
			sentinels += 1;
			const path = `.git/${PROJECT_JOURNAL_ANCHOR_PREFIX}${String(sentinels)}`;
			const tree = subscriptions.find((entry) => entry.recursive);
			// In flight means in flight once: these events were already owed when the
			// first sentinel was placed, and a stream does not redeliver them.
			const owed = inFlight;
			inFlight = [];
			if (behaviour === 'deliver') {
				setTimeout(() => {
					for (const flight of owed) tree?.event('change', flight);
					tree?.event('change', path);
				}, 0);
			}
			return {
				path,
				release: () => {
					released += 1;
					// Removing the sentinel is itself a filesystem event.
					if (behaviour === 'deliver') tree?.event('rename', path);
				},
			};
		},
	};
	return {
		port,
		subscriptions,
		counts: () => ({ closed, unrefed, released, sentinels }),
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

/**
 * A watcher stream is not synchronised with the caller that reads it.
 *
 * Node states it plainly: event ordering is not guaranteed, events may be
 * duplicated or missed, and on macOS a recursive watch goes through FSEvents,
 * which coalesces and delivers on its own schedule. So an observation taken the
 * instant a watch opens can be handed events that describe writes which happened
 * *before* it — measured here at ~11ms after `observe()` returned, naming a file
 * written before the watcher existed. The build read that as a tree mutating
 * underneath it and called a still project concurrently changed.
 *
 * A delay cannot fix this: it guesses at load. The fix is an anchor in the
 * stream, the mechanism Watchman calls a cookie — place a sentinel inside the
 * watched tree, wait to see its event, and everything the stream still owed you
 * has been delivered. What cannot be anchored is not called unchanged; it is
 * called uncertain, which the journal already knows how to say.
 */
describe('ProjectChangeJournal stream synchronisation', () => {
	it('counts what was already in flight instead of charging it to the next build', async () => {
		const fake = fakeWatchPort({ inFlight: ['src/written-before-the-watch.ts'] });
		const journal = createNodeProjectChangeJournal({
			watchPort: fake.port,
			authority: 'authoritative',
		});
		const root = rootIdentity();

		const observed = await journal.observe(root);

		expect(observed.paths).toEqual(['src/written-before-the-watch.ts']);
		expect(observed.kind).toBe('cold');
		expect(await journal.validate(root, observed)).toBe('valid');
		// One sentinel for the observation, one for the validation, and neither left
		// behind: a synchronisation that litters the tree it synchronises with would
		// be its own next false positive.
		const { sentinels, released } = fake.counts();
		expect(sentinels).toBe(2);
		expect(released).toBe(sentinels);
		journal.close();
	});

	it('never counts its own sentinel as a change to the project', async () => {
		const fake = fakeWatchPort();
		const journal = createNodeProjectChangeJournal({
			watchPort: fake.port,
			authority: 'authoritative',
		});
		const root = rootIdentity();
		const cold = await journal.observe(root);
		expect(journal.accept(root, cold)).toBe(true);

		const second = await journal.observe(root);

		expect(second).toMatchObject({ kind: 'unchanged', generation: '0', paths: [] });
		expect(fake.counts().sentinels).toBe(2);
		journal.close();
	});

	it('says uncertain rather than unchanged when the stream never answers', async () => {
		const fake = fakeWatchPort({ sentinel: 'silent' });
		const journal = createNodeProjectChangeJournal({
			watchPort: fake.port,
			authority: 'authoritative',
			anchorTimeoutMs: 20,
		});
		const root = rootIdentity();

		expect((await journal.observe(root)).kind).toBe('uncertain');
		journal.close();
	});

	it('says uncertain rather than unchanged when no sentinel can be placed', async () => {
		const fake = fakeWatchPort({ sentinel: 'refuse' });
		const journal = createNodeProjectChangeJournal({
			watchPort: fake.port,
			authority: 'authoritative',
		});
		const root = rootIdentity();

		expect((await journal.observe(root)).kind).toBe('uncertain');
		expect(fake.counts().released).toBe(0);
		journal.close();
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
		const parent = await projectTempDir('void-project-journal-native-');
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
			// Settle first. `validate` answers 'changed' when an event landed between
			// the observation and the check, which is routine right after the fixture
			// wrote package.json — a late event, not a defect. Asserting 'valid' on
			// the first try asserted that nothing arrives late, which no best-effort
			// watcher promises.
			const settled = await settleCapability(journal, identity);
			const initial = settled.observation;
			const capability = settled.capability;
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
				// The root that ends this sequence is the very directory the journal
				// opened — same device, same inode. That is what makes BOTH outcomes
				// below truthful, and it is the premise the assertions rest on.
				const finalRoot = await stat(root);
				expect(finalRoot.dev).toBe(identity.device);
				expect(finalRoot.ino).toBe(identity.inode);

				if (postAbaCapability === 'unavailable') {
					// A platform that cannot keep watching through the swap is a
					// legitimate outcome; it degrades and must not claim a clean build.
					await expectUnavailableJournalBuild(root, journal);
				} else if (observed.satisfied) {
					// The platform delivered the rename events: the journal saw churn
					// and is conservative about it. `rootGeneration` counts noticed
					// churn, it is not an identity, so it must have advanced.
					expect(afterAba.kind).toBe('uncertain');
					expect(afterAba.rootGeneration).not.toBe(initial.rootGeneration);
				} else {
					// The platform coalesced them, and `unchanged` is then the TRUTH,
					// not a miss: this is the ABA property itself. The root is the one
					// the journal opened — asserted above — so there is nothing to be
					// uncertain about. `fs.watch` is best-effort by contract, so
					// demanding delivery here failed roughly one run in five under
					// parallel load: it asserted the platform's timing, not the
					// journal's soundness.
					//
					// What must never happen — a root swapped and LEFT swapped, reported
					// as unchanged — is not detectable by watching at all. It is caught
					// by the identity check and asserted deterministically in "notices a
					// swapped root with no watcher event at all" below, with an injected
					// port that fires nothing.
					expect(['unchanged', 'changed']).toContain(afterAba.kind);
					expect(afterAba.rootGeneration).toBe(initial.rootGeneration);
				}
			}
		} finally {
			journal.close();
		}
	});
});

describe('ProjectChangeJournal root identity', () => {
	it('notices a swapped root with no watcher event at all', async () => {
		// The macOS CI failure, reproduced deterministically: fs.watch there
		// reports nothing when the watched directory is replaced. With an injected
		// port that fires no event, the only thing that can catch the swap is
		// checking the identity rather than watching for it.
		const parent = await projectTempDir('void-journal-identity-');
		const root = join(parent, 'root');
		const saved = join(parent, 'saved');
		const replacement = join(parent, 'replacement');
		await mkdir(root);
		await mkdir(replacement);
		await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'identity' }));
		const rootPort = createNodeProjectRootPort();
		const identity = await rootPort.open(root);
		const fake = fakeWatchPort();
		const journal = createNodeProjectChangeJournal({ watchPort: fake.port });
		try {
			const initial = await journal.observe(identity);
			expect(journal.accept(identity, initial)).toBe(true);
			expect((await journal.observe(identity)).kind).toBe('unchanged');

			await rename(root, saved);
			await rename(replacement, root);

			const afterSwap = await journal.observe(identity);
			expect(afterSwap.kind).toBe('uncertain');
			expect(afterSwap.rootGeneration).not.toBe(initial.rootGeneration);
		} finally {
			journal.close();
		}
	});

	it('does not cry wolf on a root that never moved', async () => {
		// The check runs on every observation, so a false positive here would make
		// every project permanently uncertain and every cache useless.
		const parent = await projectTempDir('void-journal-stable-');
		const root = join(parent, 'root');
		await mkdir(root);
		await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'stable' }));
		const identity = await createNodeProjectRootPort().open(root);
		const fake = fakeWatchPort();
		const journal = createNodeProjectChangeJournal({ watchPort: fake.port });
		try {
			const initial = await journal.observe(identity);
			expect(journal.accept(identity, initial)).toBe(true);
			for (let round = 0; round < 3; round += 1) {
				expect((await journal.observe(identity)).kind).toBe('unchanged');
			}
		} finally {
			journal.close();
		}
	});
});
