import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageManagerCommand } from '../packages/cli/scripts/conformance-process.mjs';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const pnpm = packageManagerCommand('pnpm');
const temporary = await mkdtemp(join(tmpdir(), 'void-project-graph-conformance-'));
const consumer = join(temporary, 'consumer');

function run(command, args, cwd) {
	execFileSync(command, args, { cwd, stdio: 'inherit' });
}

try {
	run(pnpm.executable, [...pnpm.prefixArguments, '--filter', '@voidcorp/harness-graph', 'build'], repository);
	run(pnpm.executable, [...pnpm.prefixArguments, '--filter', '@voidcorp/harness-graph', 'pack', '--pack-destination', temporary],
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
			dependencies: {
				'@voidcorp/harness-graph': 'file:./harness-graph.tgz',
				// The consumer installs its own compiler, as a real project does.
				// harness-graph does not hand one over: the analysed project's
				// compiler is the one that must do the analysis.
				typescript: '^5.6.0',
			},
		}),
	);
	run(pnpm.executable, [...pnpm.prefixArguments, 'install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'], consumer);
	await writeFile(
		join(consumer, 'smoke.mjs'),
		[
			"import { mkdtemp, rm, writeFile } from 'node:fs/promises';",
			"import { tmpdir } from 'node:os';",
			"import { join } from 'node:path';",
			"import { buildProjectGraph } from '@voidcorp/harness-graph/project';",
			"import { createMemoryProjectCachePort } from '@voidcorp/harness-graph/project';",
			// The analysed project lives INSIDE the consumer, so it resolves the',
			"// consumer's own TypeScript. That is the contract this package now",
			'// holds: a project is analysed by its own compiler, never by one the',
			'// harness carries. A fixture in the system temp directory resolves',
			'// none, and is asserted below to degrade rather than to borrow ours.',
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
			"const root = await mkdtemp(join(process.cwd(), 'project-'));",
			'try {',
			"await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));",
			"await writeFile(join(root, 'index.ts'), 'export const value = 1;\\n');",
			'const result = await buildProjectGraph({',
			'  root, git, cache: createMemoryProjectCachePort(), journal,',
			'});',
			"if (result.state !== 'fresh' || result.metrics.extractedFiles !== 2)",
			"  throw new Error('packed ProjectGraph smoke failed');",
			"if (!result.graph.source.version.includes('+typescript.5.'))",
			"  throw new Error('packed ProjectGraph did not record its compiler version');",
			'if (!/^sha256:[a-f0-9]{64}$/.test(result.snapshot.id)',
			"  || result.snapshot.semantics !== 'observed-content-v1')",
			"  throw new Error('packed ProjectGraph snapshot identity failed');",
			"if (!result.graph.nodes.some((node) => node.kind === 'root'",
			'  && node.data.snapshotId === result.snapshot.id))',
			"  throw new Error('packed ProjectGraph root token failed');",
			'} finally {',
			'  await rm(root, { recursive: true, force: true });',
			'}',
			'',
			'// Same build, on a project that resolves no compiler at all.',
			"const orphan = await mkdtemp(join(tmpdir(), 'void-project-graph-orphan-'));",
			'try {',
			"await writeFile(join(orphan, 'package.json'), JSON.stringify({ name: 'orphan' }));",
			"await writeFile(join(orphan, 'index.ts'), 'export const value = 1;\\n');",
			'const degraded = await buildProjectGraph({',
			'  root: orphan, git, cache: createMemoryProjectCachePort(), journal,',
			'});',
			"if (degraded.state === 'fresh')",
			"  throw new Error('a project with no compiler must not build a complete snapshot');",
			"const issue = degraded.issues.find((entry) => entry.code === 'compiler-unavailable');",
			'if (issue === undefined || !/Lost:/.test(issue.message))',
			"  throw new Error('a missing compiler must name itself and what it cost');",
			'} finally {',
			'  await rm(orphan, { recursive: true, force: true });',
			'}',
		].join('\n'),
	);
	run(process.execPath, ['smoke.mjs'], consumer);
	process.stdout.write('ProjectGraph packed subpath conformance passed.\n');
} finally {
	if (process.env['VOID_KEEP_CONFORMANCE'] === undefined) {
		await rm(temporary, { recursive: true, force: true });
	} else {
		process.stdout.write(`kept ${temporary}\n`);
	}
}
