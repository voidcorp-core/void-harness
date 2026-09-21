import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// The README promises that a consumer can extend `tsconfig.strict.json` with the
// configuration it shows, whatever TypeScript it runs from 5.0 onwards. That
// promise is only as good as the example, so the example itself is what gets
// compiled here, read out of the README rather than restated in this file.

const PACK = dirname(import.meta.dirname);
const resolve = createRequire(import.meta.url).resolve;
const COMPILERS = [
	{ label: 'TypeScript 5.0 (floor)', packageName: 'typescript-5.0' },
	{ label: 'TypeScript 5.9', packageName: 'typescript-5.9' },
	{ label: 'TypeScript 6.0', packageName: 'typescript-6.0' },
	{ label: 'TypeScript 7', packageName: 'typescript' },
] as const;
const TSC_TIMEOUT_MS = 60_000;
const consumers: string[] = [];

afterAll(() => {
	for (const consumer of consumers) rmSync(consumer, { recursive: true, force: true });
});

function documentedConfig(): string {
	const readme = readFileSync(join(PACK, 'README.md'), 'utf8');
	const example = /In TS configs:\s*```json\n([\s\S]*?)```/.exec(readme)?.[1];
	if (example === undefined) throw new Error('README.md shows no tsconfig example');
	return example;
}

function packageDirectory(name: string): string {
	return dirname(resolve(`${name}/package.json`));
}

function consumerProject(source: string): string {
	const root = mkdtempSync(join(tmpdir(), 'pack-monorepo-tsconfig-'));
	consumers.push(root);
	mkdirSync(join(root, 'node_modules/@voidcorp'), { recursive: true });
	mkdirSync(join(root, 'node_modules/@types'), { recursive: true });
	symlinkSync(PACK, join(root, 'node_modules/@voidcorp/pack-monorepo'), 'junction');
	symlinkSync(packageDirectory('@types/node'), join(root, 'node_modules/@types/node'), 'junction');
	mkdirSync(join(root, 'src'));
	writeFileSync(join(root, 'src/index.ts'), source);
	writeFileSync(join(root, 'tsconfig.json'), documentedConfig());
	return root;
}

function compile(packageName: string, root: string): { status: number | null; output: string } {
	const tsc = join(packageDirectory(packageName), 'bin/tsc');
	const run = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {
		cwd: root,
		encoding: 'utf8',
		timeout: TSC_TIMEOUT_MS,
	});
	return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe.each(COMPILERS)('the documented tsconfig under $label', ({ packageName }) => {
	it('compiles a Node consumer and emits its sources at the root of outDir', () => {
		const root = consumerProject('export const directory: string = process.cwd();\n');

		const result = compile(packageName, root);

		expect(result.output).toBe('');
		expect(result.status).toBe(0);
		expect(existsSync(join(root, 'dist/index.js'))).toBe(true);
		expect(existsSync(join(root, 'dist/index.d.ts'))).toBe(true);
	});

	it('enforces the strict options it inherits', () => {
		const root = consumerProject(
			'export const first = (values: string[]): string => values[0];\n',
		);

		const result = compile(packageName, root);

		expect(result.status).not.toBe(0);
		expect(result.output).toContain('TS2322');
	});
});
