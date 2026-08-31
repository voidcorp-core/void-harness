import { stat, unlink, writeFile } from 'node:fs/promises';
import { watch as watchNode, type FSWatcher } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
	normalizeProjectPath,
	PROJECT_JOURNAL_ANCHOR_PREFIX,
	projectPathIsIgnored,
} from './extractors/filesystem.js';
import type { ProjectRootIdentity } from './extractors/types.js';

// Re-exported where the journal is imported from: it is the journal that places
// a sentinel, even though scanning is what must refuse to index one.
export { PROJECT_JOURNAL_ANCHOR_PREFIX };

const DEFAULT_MAX_ROOTS = 16;
const DEFAULT_MAX_CHANGED_PATHS = 10_000;
/**
 * How long an observation waits to see its own sentinel come back.
 *
 * Measured delivery on macOS for a tree that had just been written is ~11ms, so
 * this is two orders of magnitude of headroom for a loaded machine. Exceeding it
 * is not an error: it means the stream could not be caught up with in a bounded
 * time, and the observation says `uncertain` instead of pretending otherwise.
 */
const DEFAULT_ANCHOR_TIMEOUT_MS = 1_000;
/** Sentinels remembered per root, so one that lands before its waiter is not lost. */
const MAX_REMEMBERED_ANCHORS = 64;

export type ProjectChangeKind = 'cold' | 'unchanged' | 'changed' | 'uncertain';
export type ProjectChangeAuthority = 'advisory' | 'authoritative';

export interface ProjectChangeObservation {
	readonly kind: ProjectChangeKind;
	readonly authority: ProjectChangeAuthority;
	readonly generation: string;
	readonly rootGeneration: string;
	readonly paths: readonly string[];
}

export type ProjectChangeValidation = 'valid' | 'changed' | 'unavailable';

export interface ProjectChangeJournal {
	observe(root: ProjectRootIdentity): Promise<ProjectChangeObservation>;
	validate(
		root: ProjectRootIdentity,
		observation: ProjectChangeObservation,
	): Promise<ProjectChangeValidation>;
	accept(root: ProjectRootIdentity, observation: ProjectChangeObservation): boolean;
	dispose(root: ProjectRootIdentity): void;
	close(): void;
}

export interface ProjectWatchHandle {
	close(): void;
	unref(): void;
}

/**
 * A sentinel placed inside a watched tree so its own event can be recognised.
 *
 * `path` is relative to the watched root and is what the stream will report;
 * `release` removes the sentinel once it has been seen, or once waiting for it
 * has been given up on.
 */
export interface ProjectWatchAnchor {
	readonly path: string;
	release(): void;
}

export interface ProjectWatchPort {
	watch(
		path: string,
		recursive: boolean,
		onEvent: (event: 'change' | 'rename', filename: string | undefined) => void,
		onError: () => void,
	): ProjectWatchHandle;
	/**
	 * Place a sentinel under `root`, or answer `undefined` when none can be placed
	 * — a read-only tree, a volume that refuses the write. An observation that
	 * cannot anchor itself reports `uncertain` rather than claiming a stream it
	 * never caught up with.
	 */
	anchor(root: string): Promise<ProjectWatchAnchor | undefined>;
}

interface JournalState {
	readonly root: ProjectRootIdentity;
	readonly handles: readonly ProjectWatchHandle[];
	readonly changedAt: Map<string, bigint>;
	sequence: bigint;
	rootSequence: bigint;
	accepted: bigint | undefined;
	uncertainAt: bigint | undefined;
	saturated: boolean;
	reliable: boolean;
	readonly anchorsSeen: Set<string>;
	/**
	 * Waiters keyed by sentinel path, not a single one.
	 *
	 * Git inspection validates the observation while its commands run, so two
	 * validations overlap routinely. A lone waiter meant the second overwrote the
	 * first, which then waited out its whole deadline and reported an uncertainty
	 * that had not happened.
	 */
	readonly awaitedAnchors: Map<string, () => void>;
}

/**
 * Where a sentinel is written, in order of preference.
 *
 * `.git` first, for the reason Watchman writes its cookies there: the directory
 * is watched like any other but no version control reports what is inside it, so
 * a sentinel that lives for a few milliseconds never shows up in someone's
 * `git status`. `.void` next, for a harnessed project without a repository. The
 * root itself last, under a reserved name the scan is taught to ignore.
 */
const ANCHOR_DIRECTORIES = ['.git', '.void', ''] as const;

let anchorSequence = 0;

async function placeAnchor(root: string): Promise<ProjectWatchAnchor | undefined> {
	anchorSequence += 1;
	const name = `${PROJECT_JOURNAL_ANCHOR_PREFIX}${String(process.pid)}-${String(anchorSequence)}`;
	for (const directory of ANCHOR_DIRECTORIES) {
		const relative = directory === '' ? name : `${directory}/${name}`;
		const absolute = join(root, relative);
		try {
			await writeFile(absolute, '', { flag: 'wx', mode: 0o600 });
		} catch {
			continue;
		}
		return Object.freeze({
			path: relative,
			release: () => {
				unlink(absolute).catch(() => undefined);
			},
		});
	}
	return undefined;
}

const NODE_WATCH_PORT: ProjectWatchPort = {
	anchor: placeAnchor,
	watch(path, recursive, onEvent, onError): ProjectWatchHandle {
		const watcher: FSWatcher = watchNode(
			path,
			{
				encoding: 'utf8',
				persistent: false,
				recursive,
			},
			(event, filename) => onEvent(event, filename === null ? undefined : String(filename)),
		);
		watcher.on('error', onError);
		return Object.freeze({
			close: () => watcher.close(),
			unref: () => watcher.unref(),
		});
	},
};

function sameRoot(left: ProjectRootIdentity, right: ProjectRootIdentity): boolean {
	return left.path === right.path && left.device === right.device && left.inode === right.inode;
}

function observation(
	state: JournalState,
	authority: ProjectChangeAuthority,
): ProjectChangeObservation {
	const paths = [...state.changedAt.entries()]
		.filter(([, generation]) => state.accepted === undefined || generation > state.accepted)
		.map(([path]) => path)
		.sort();
	const uncertain =
		!state.reliable ||
		(state.uncertainAt !== undefined &&
			(state.accepted === undefined || state.uncertainAt > state.accepted));
	const kind: ProjectChangeKind =
		state.accepted === undefined
			? uncertain
				? 'uncertain'
				: 'cold'
			: uncertain
				? 'uncertain'
				: state.sequence === state.accepted
					? 'unchanged'
					: 'changed';
	const result: ProjectChangeObservation = {
		kind,
		authority,
		generation: state.sequence.toString(),
		rootGeneration: state.rootSequence.toString(),
		paths: Object.freeze(paths),
	};
	return Object.freeze(result);
}

function closeState(state: JournalState): void {
	for (const handle of state.handles) handle.close();
}

export interface ProjectJournalOptions {
	readonly maxRoots?: number;
	readonly maxChangedPaths?: number;
	readonly anchorTimeoutMs?: number;
	readonly watchPort?: ProjectWatchPort;
	readonly authority?: ProjectChangeAuthority;
}

interface JournalLimits {
	readonly maxRoots: number;
	readonly maxChangedPaths: number;
	readonly anchorTimeoutMs: number;
}

interface JournalContext extends JournalLimits {
	readonly watchPort: ProjectWatchPort;
	readonly authority: ProjectChangeAuthority;
	readonly states: Map<string, JournalState>;
}

function validateJournalLimits(options: ProjectJournalOptions): JournalLimits {
	const maxRoots = options.maxRoots ?? DEFAULT_MAX_ROOTS;
	const maxChangedPaths = options.maxChangedPaths ?? DEFAULT_MAX_CHANGED_PATHS;
	const anchorTimeoutMs = options.anchorTimeoutMs ?? DEFAULT_ANCHOR_TIMEOUT_MS;
	if (!Number.isSafeInteger(maxRoots) || maxRoots < 1 || maxRoots > 1_024) {
		throw new Error('PROJECT_JOURNAL_INVALID: maxRoots must be between 1 and 1024');
	}
	if (!Number.isSafeInteger(maxChangedPaths) || maxChangedPaths < 1 || maxChangedPaths > 50_000) {
		throw new Error('PROJECT_JOURNAL_INVALID: maxChangedPaths must be between 1 and 50000');
	}
	if (!Number.isSafeInteger(anchorTimeoutMs) || anchorTimeoutMs < 1 || anchorTimeoutMs > 60_000) {
		throw new Error('PROJECT_JOURNAL_INVALID: anchorTimeoutMs must be between 1 and 60000');
	}
	return Object.freeze({ maxRoots, maxChangedPaths, anchorTimeoutMs });
}

function markUncertain(state: JournalState): void {
	state.sequence += 1n;
	state.uncertainAt = state.sequence;
}

function markRootUncertain(state: JournalState): void {
	state.rootSequence += 1n;
	markUncertain(state);
}

/**
 * Has the directory at this path stopped being the root we opened?
 *
 * The watcher cannot answer this everywhere. `fs.watch` on macOS does not
 * report the replacement of the directory it is watching, so a root swapped out
 * from under us produces no event at all and the journal keeps reporting
 * `unchanged` about a root that no longer exists — a cache served for a tree
 * that is gone. Linux reports it; relying on that is relying on the platform.
 *
 * So the identity is checked rather than watched: device and inode, read at
 * observation time, compared with what we opened.
 *
 * An unreadable path answers "do not know", not "replaced". A path this journal
 * never had on disk — every unit test using an injected watch port — must not
 * be turned into a permanent uncertainty, and a root that truly vanished still
 * reaches us as a rename event on the parent.
 */
async function rootWasReplaced(state: JournalState): Promise<boolean> {
	try {
		const current = await stat(state.root.path, { bigint: false });
		return current.dev !== state.root.device || current.ino !== state.root.inode;
	} catch {
		return false;
	}
}

/**
 * Wait for a sentinel that may already have arrived.
 *
 * The stream can deliver it between the write and this call, so what was
 * remembered is checked first. Nothing here polls and nothing sleeps: either the
 * event lands, or the bounded deadline says it did not.
 */
function awaitAnchor(state: JournalState, path: string, timeoutMs: number): Promise<boolean> {
	if (state.anchorsSeen.delete(path)) return Promise.resolve(true);
	return new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => {
			state.awaitedAnchors.delete(path);
			resolve(false);
		}, timeoutMs);
		timer.unref?.();
		state.awaitedAnchors.set(path, () => {
			clearTimeout(timer);
			resolve(true);
		});
	});
}

/**
 * Catch up with the event stream before an observation freezes a generation.
 *
 * Without this the journal answers a question nobody asked it: not "has the tree
 * changed since you looked", but "has anything reached me yet", and the two
 * differ by exactly the events the stream still owes. A sentinel written into
 * the watched tree separates them — everything already in flight is delivered
 * before the sentinel's own event is. Watchman calls this a cookie, and its
 * reason for preferring it over a delay applies unchanged here: a delay guesses
 * at load, an anchor does not.
 */
async function catchUpWithStream(state: JournalState, context: JournalContext): Promise<void> {
	if (!state.reliable) return;
	const anchor = await context.watchPort.anchor(state.root.path).catch(() => undefined);
	if (anchor === undefined) {
		markUncertain(state);
		return;
	}
	try {
		if (!(await awaitAnchor(state, anchor.path, context.anchorTimeoutMs))) markUncertain(state);
	} finally {
		state.awaitedAnchors.delete(anchor.path);
		anchor.release();
	}
}

function failState(state: JournalState): void {
	if (!state.reliable) return;
	state.reliable = false;
	markUncertain(state);
	closeState(state);
}

/**
 * Did this event carry a sentinel rather than a change to the project?
 *
 * Recognised before anything else, and never counted: a sentinel is written to
 * be seen, so treating it as a change would make every synchronisation report
 * the very thing it exists to rule out. It is remembered because it can be
 * delivered before the observation that placed it starts waiting.
 */
function recordAnchor(state: JournalState, path: string): boolean {
	if (!basename(path).startsWith(PROJECT_JOURNAL_ANCHOR_PREFIX)) return false;
	const waiting = state.awaitedAnchors.get(path);
	if (waiting !== undefined) {
		state.awaitedAnchors.delete(path);
		waiting();
		return true;
	}
	if (state.anchorsSeen.size >= MAX_REMEMBERED_ANCHORS) {
		const oldest = state.anchorsSeen.values().next().value;
		if (oldest !== undefined) state.anchorsSeen.delete(oldest);
	}
	state.anchorsSeen.add(path);
	return true;
}

function markPath(state: JournalState, rawPath: string, maxChangedPaths: number): void {
	let path: string;
	try {
		path = normalizeProjectPath(rawPath.replaceAll('\\', '/'));
	} catch {
		markUncertain(state);
		return;
	}
	if (recordAnchor(state, path)) return;
	if (projectPathIsIgnored(path)) return;
	state.sequence += 1n;
	if (state.saturated) {
		state.uncertainAt = state.sequence;
		return;
	}
	if (!state.changedAt.has(path) && state.changedAt.size >= maxChangedPaths) {
		state.changedAt.clear();
		state.saturated = true;
		state.uncertainAt = state.sequence;
		return;
	}
	state.changedAt.set(path, state.sequence);
}

function emptyState(
	root: ProjectRootIdentity,
	handles: readonly ProjectWatchHandle[],
): JournalState {
	return {
		root,
		handles,
		changedAt: new Map(),
		sequence: 0n,
		rootSequence: 0n,
		accepted: undefined,
		uncertainAt: undefined,
		saturated: false,
		reliable: true,
		anchorsSeen: new Set(),
		awaitedAnchors: new Map(),
	};
}

function watchRoot(state: JournalState, context: JournalContext): ProjectWatchHandle {
	return context.watchPort.watch(
		state.root.path,
		true,
		(_event, filename) => {
			if (filename === undefined) markRootUncertain(state);
			else markPath(state, filename, context.maxChangedPaths);
		},
		() => failState(state),
	);
}

function watchParent(state: JournalState, context: JournalContext): ProjectWatchHandle {
	const rootName = basename(state.root.path);
	return context.watchPort.watch(
		dirname(state.root.path),
		false,
		(_event, filename) => {
			if (filename === undefined) markRootUncertain(state);
			else if (filename.replaceAll('\\', '/') === rootName) markRootUncertain(state);
		},
		() => failState(state),
	);
}

function createState(root: ProjectRootIdentity, context: JournalContext): JournalState {
	const handles: ProjectWatchHandle[] = [];
	const state = emptyState(root, handles);
	try {
		const rootHandle = watchRoot(state, context);
		rootHandle.unref();
		handles.push(rootHandle);
		const parentHandle = watchParent(state, context);
		parentHandle.unref();
		handles.push(parentHandle);
	} catch {
		for (const handle of handles) handle.close();
		failState(state);
	}
	return state;
}

function refreshState(states: Map<string, JournalState>, state: JournalState): JournalState {
	states.delete(state.root.path);
	states.set(state.root.path, state);
	return state;
}

function evictOldestState(context: JournalContext): void {
	const oldest = context.states.entries().next().value as [string, JournalState] | undefined;
	if (oldest === undefined) return;
	closeState(oldest[1]);
	context.states.delete(oldest[0]);
}

function stateFor(root: ProjectRootIdentity, context: JournalContext): JournalState {
	const existing = context.states.get(root.path);
	if (existing !== undefined && sameRoot(existing.root, root)) {
		return refreshState(context.states, existing);
	}
	if (existing !== undefined) closeState(existing);
	while (context.states.size >= context.maxRoots) evictOldestState(context);
	const created = createState(root, context);
	context.states.set(root.path, created);
	return created;
}

function acceptObservation(
	state: JournalState | undefined,
	root: ProjectRootIdentity,
	accepted: ProjectChangeObservation,
	authority: ProjectChangeAuthority,
): boolean {
	if (
		state === undefined ||
		!sameRoot(state.root, root) ||
		!state.reliable ||
		accepted.authority !== authority ||
		state.sequence.toString() !== accepted.generation
	)
		return false;
	const generation = BigInt(accepted.generation);
	state.accepted = generation;
	for (const [path, changedAt] of state.changedAt) {
		if (changedAt <= generation) state.changedAt.delete(path);
	}
	if (state.uncertainAt !== undefined && state.uncertainAt <= generation) {
		state.uncertainAt = undefined;
		state.saturated = false;
	}
	return true;
}

function disposeState(states: Map<string, JournalState>, root: ProjectRootIdentity): void {
	const state = states.get(root.path);
	if (state === undefined) return;
	closeState(state);
	states.delete(root.path);
}

function closeStates(states: Map<string, JournalState>): void {
	for (const state of states.values()) closeState(state);
	states.clear();
}

function createJournal(context: JournalContext): ProjectChangeJournal {
	return {
		async observe(root) {
			const state = stateFor(root, context);
			await catchUpWithStream(state, context);
			if (await rootWasReplaced(state)) markRootUncertain(state);
			return observation(state, context.authority);
		},
		async validate(root, expected) {
			const state = context.states.get(root.path);
			if (
				state === undefined ||
				!sameRoot(state.root, root) ||
				!state.reliable ||
				expected.authority !== context.authority
			) {
				return 'unavailable';
			}
			// The same anchor, for the opposite reason. Here an unsynchronised stream
			// would answer `valid` about a tree that did move, because the events
			// proving it had not been delivered yet — a stale cache published as
			// fresh. Not being able to catch up is therefore reported as
			// `unavailable`, never as agreement.
			const anchoredAt = state.sequence;
			await catchUpWithStream(state, context);
			if (state.sequence !== anchoredAt && state.uncertainAt === state.sequence) {
				return 'unavailable';
			}
			return state.sequence.toString() === expected.generation ? 'valid' : 'changed';
		},
		accept(root, accepted) {
			return acceptObservation(context.states.get(root.path), root, accepted, context.authority);
		},
		dispose(root) {
			disposeState(context.states, root);
		},
		close() {
			closeStates(context.states);
		},
	};
}

export function createNodeProjectChangeJournal(
	options: ProjectJournalOptions = {},
): ProjectChangeJournal {
	const limits = validateJournalLimits(options);
	if (options.authority === 'authoritative' && options.watchPort === undefined) {
		throw new Error(
			'PROJECT_JOURNAL_INVALID: authoritative authority requires an injected watchPort',
		);
	}
	const context: JournalContext = {
		...limits,
		watchPort: options.watchPort ?? NODE_WATCH_PORT,
		authority: options.authority ?? 'advisory',
		states: new Map(),
	};
	return Object.freeze(createJournal(context));
}

let defaultJournal: ProjectChangeJournal | undefined;

export function defaultProjectChangeJournal(): ProjectChangeJournal {
	defaultJournal ??= createNodeProjectChangeJournal();
	return defaultJournal;
}
