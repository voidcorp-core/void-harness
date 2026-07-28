import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const temporary = await mkdtemp(join(tmpdir(), 'void-project-graph-conformance-'));
const consumer = join(temporary, 'consumer');

function run(command, args, cwd) {
	execFileSync(command, args, { cwd, stdio: 'inherit' });
}

try {
	run(pnpm, ['--filter', '@voidcorp/harness-graph', 'build'], repository);
	run(
		pnpm,
		['--filter', '@voidcorp/harness-graph', 'pack', '--pack-destination', temporary],
		repository,
	);
	const tarballName = (await readdir(temporary)).find((name) => name.endsWith('.tgz'));
	if (tarballName === undefined)
		throw new Error('ProjectGraph conformance pack did not produce a tarball');
	await mkdir(consumer);
	await cp(join(temporary, tarballName), join(consumer, 'harness-graph.tgz'));
	await writeFile(
		join(consumer, 'package.json'),
		JSON.stringify({
			private: true,
			type: 'module',
			dependencies: { '@voidcorp/harness-graph': 'file:./harness-graph.tgz' },
		}),
	);
	run(pnpm, ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], consumer);
	await writeFile(
		join(consumer, 'smoke.mjs'),
		[
			"import { mkdtemp, rm, writeFile } from 'node:fs/promises';",
			"import { tmpdir } from 'node:os';",
			"import { join } from 'node:path';",
			"import { buildProjectGraph } from '@voidcorp/harness-graph/project';",
			"import { createMemoryProjectCachePort } from '@voidcorp/harness-graph/project';",
			"const root = await mkdtemp(join(tmpdir(), 'void-project-graph-import-'));",
			'try {',
			"await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));",
			"await writeFile(join(root, 'index.ts'), 'export const value = 1;\\n');",
			'const git = { inspect: async () => ({',
			"  head: 'a'.repeat(40), changed: [], deleted: [], renames: [], owners: {},",
			'  availability: {',
			"    head: 'available', changes: 'available', ownership: 'available',",
			'  }, issues: [],',
			'}) };',
			'const observation = Object.freeze({',
			"  kind: 'cold', authority: 'authoritative', generation: '0',",
			"  rootGeneration: '0', paths: Object.freeze([]),",
			'});',
			'const journal = Object.freeze({',
			'  observe: async () => observation,',
			"  validate: async () => 'valid',",
			'  accept: () => true, dispose: () => undefined, close: () => undefined,',
			'});',
			'const result = await buildProjectGraph({',
			'  root, git, cache: createMemoryProjectCachePort(), journal,',
			'});',
			"if (result.state !== 'fresh' || result.metrics.extractedFiles !== 2)",
			"  throw new Error('packed ProjectGraph smoke failed');",
			'if (!/^sha256:[a-f0-9]{64}$/.test(result.snapshot.id)',
			"  || result.snapshot.semantics !== 'observed-content-v1')",
			"  throw new Error('packed ProjectGraph snapshot identity failed');",
			"if (!result.graph.nodes.some((node) => node.kind === 'root'",
			'  && node.data.snapshotId === result.snapshot.id))',
			"  throw new Error('packed ProjectGraph root token failed');",
			'} finally {',
			'  await rm(root, { recursive: true, force: true });',
			'}',
		].join('\n'),
	);
	run(process.execPath, ['smoke.mjs'], consumer);
	process.stdout.write('ProjectGraph packed subpath conformance passed.\n');
} finally {
	await rm(temporary, { recursive: true, force: true });
}
