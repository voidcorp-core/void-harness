// The query benchmark corpus: a synthetic ProjectGraph at monorepo scale.
//
// Why synthetic rather than a real repository: a published number has to be
// reproducible on another machine, and no two checkouts of a real tree are the
// same graph. Every value here comes from one seeded generator, so the corpus is
// byte-identical everywhere and the numbers can be compared across runs.
//
// Why it is shaped like this: the queries are only as fast as the structures they
// actually walk. A corpus of isolated files would measure nothing. So it carries
// the four structures the accuracy corpus proves correctness on — cycles, dynamic
// imports, test coverage, rename lineage — plus cross-package edges, which are
// what make a traversal expensive.

const FILES_PER_PACKAGE = 20;
const IMPORTS_PER_FILE = 3;
const CYCLE_LENGTH = 5;
/** One file in this many is a test, is dynamically imported, or has an owner. */
const TEST_EVERY = 5;
const DYNAMIC_EVERY = 10;
const OWNER_EVERY = 25;
const OWNERS = 40;
const TOMBSTONES = 100;

/** Deterministic PRNG (mulberry32): the corpus must not move between runs. */
function seeded(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

const provenance = Object.freeze({
	origin: 'extracted',
	confidence: 1,
	sources: Object.freeze([
		Object.freeze({ kind: 'path', ref: 'corpus', hashOrVersion: 'sha256:corpus' }),
	]),
});

function fileId(path) {
	return `project:file:${path}`;
}

function node(id, kind, label) {
	return { id, kind, label, data: {}, provenance };
}

function edge(kind, from, to) {
	return { id: `${kind}:${from}->${to}`, kind, from, to, data: {}, provenance };
}

/**
 * A corpus of `packages * FILES_PER_PACKAGE` files.
 *
 * @param {number} packages how many workspaces to generate
 * @returns {{ snapshot: object, seeds: object, shape: object }}
 */
export function buildQueryCorpus(packages = 250) {
	const random = seeded(0x5eed);
	const paths = [];
	for (let pkg = 0; pkg < packages; pkg += 1) {
		for (let file = 0; file < FILES_PER_PACKAGE; file += 1) {
			paths.push(`packages/pkg-${pkg}/src/module-${file}.ts`);
		}
	}

	const nodes = paths.map((path) => node(fileId(path), 'file', path.split('/').pop()));
	const edges = [];

	for (const [index, path] of paths.entries()) {
		const from = fileId(path);
		for (let slot = 0; slot < IMPORTS_PER_FILE; slot += 1) {
			// Two intra-package targets and one cross-package target: the cross edges
			// are what make impact traversals reach beyond a workspace.
			const target =
				slot === IMPORTS_PER_FILE - 1
					? Math.floor(random() * paths.length)
					: index - (index % FILES_PER_PACKAGE) + Math.floor(random() * FILES_PER_PACKAGE);
			if (target === index || paths[target] === undefined) continue;
			const kind = index % DYNAMIC_EVERY === 0 && slot === 0 ? 'dynamic-imports' : 'imports';
			edges.push(edge(kind, from, fileId(paths[target])));
		}
		// A ring inside each package, so every traversal meets a cycle.
		if (index % FILES_PER_PACKAGE < CYCLE_LENGTH) {
			const base = index - (index % FILES_PER_PACKAGE);
			const next = base + ((index % FILES_PER_PACKAGE) + 1) % CYCLE_LENGTH;
			if (paths[next] !== undefined) edges.push(edge('imports', from, fileId(paths[next])));
		}
	}

	for (let index = 0; index < paths.length; index += TEST_EVERY) {
		const testPath = paths[index].replace('.ts', '.test.ts');
		nodes.push(node(fileId(testPath), 'test', testPath.split('/').pop()));
		edges.push(edge('tests', fileId(testPath), fileId(paths[index])));
		edges.push(edge('imports', fileId(testPath), fileId(paths[index])));
	}

	for (let owner = 0; owner < OWNERS; owner += 1) {
		nodes.push(node(`project:owner:owner-${owner}`, 'owner', `Owner ${owner}`));
	}
	for (let index = 0; index < paths.length; index += OWNER_EVERY) {
		edges.push(
			edge('owned-by', fileId(paths[index]), `project:owner:owner-${index % OWNERS}`),
		);
	}

	for (let index = 0; index < TOMBSTONES; index += 1) {
		const retired = `packages/pkg-${index}/src/retired.ts`;
		nodes.push(node(fileId(retired), 'file', 'retired.ts'));
		edges.push(edge('previous-id', fileId(retired), fileId(paths[index * FILES_PER_PACKAGE])));
	}

	return {
		snapshot: {
			schemaVersion: 3,
			graphId: 'project:current',
			graphType: 'project',
			source: { kind: 'native', version: 'benchmark-corpus-v1', rootHash: 'sha256:corpus' },
			nodes,
			edges,
			hyperedges: [],
		},
		// Fixed seeds so every sample asks the same questions of the same nodes.
		seeds: {
			file: fileId(paths[0]),
			far: fileId(paths[paths.length - 1]),
			retired: fileId('packages/pkg-0/src/retired.ts'),
			owned: fileId(paths[0]),
			tested: fileId(paths[0]),
		},
		shape: {
			packages,
			files: paths.length,
			nodes: nodes.length,
			edges: edges.length,
		},
	};
}
