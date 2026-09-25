// @test-resource subprocess
import { spawnSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, expect, it } from 'vitest';
const CLI = resolve(__dirname, '../../packages/cli/bin/void-machine.mjs');
const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function fixture() {
	const root = mkdtempSync(join(tmpdir(), 'void-why-cli-'));
	roots.push(root);
	return root;
}
function put(root: string, path: string, content: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), content);
}
function run(root: string, ...args: string[]) {
	return spawnSync(process.execPath, [CLI, ...args], {
		cwd: root,
		encoding: 'utf8',
		timeout: 15000,
		maxBuffer: 1024 * 1024,
	});
}
const path = 'docs/decisions-log/example.md';
const adr = (title: string, affects = 'src/a.ts') =>
	`---\nid: adr:example\ntitle: ${title}\nstatus: accepted\nsupersedes: []\naffects: [${affects}]\n---\nHuman source.\n`;
it('help and invalid argv leave an empty consumer unchanged', () => {
	const root = fixture();
	for (const flag of ['--help', '-h']) {
		const result = run(root, 'why', flag);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('why <file>');
	}
	for (const args of [[], ['--json'], ['one', 'two'], ['../outside']])
		expect(run(root, 'why', ...args).status).toBe(2);
	expect(readdirSync(root)).toEqual([]);
});
it('reads changed and deleted declaration sources despite a persisted knowledge artifact', () => {
	const root = fixture();
	put(root, 'src/a.ts', 'export const value = 1;');
	put(root, path, adr('Original reason'));
	const generated = run(root, 'graph', 'project-build');
	expect(generated.status, generated.stderr + generated.stdout).toBe(0);
	const artifact = readFileSync(join(root, '.void/knowledge.json'), 'utf8');
	const first = run(root, 'why', 'src/a.ts');
	expect(first.status, first.stderr).toBe(0);
	expect(first.stdout).toContain('Original reason');
	put(root, path, adr('Current reason', 'src/a.ts, deleted.ts'));
	const changed = run(root, 'why', 'src/a.ts');
	expect(changed.status, changed.stderr).toBe(0);
	expect(changed.stdout).toContain('Current reason');
	expect(changed.stdout).not.toContain('Original reason');
	expect(changed.stdout).toContain('Knowledge diagnostics');
	expect(changed.stdout).toContain('deleted.ts');
	expect(changed.stdout).toContain('partial');
	unlinkSync(join(root, path));
	const deleted = run(root, 'why', 'src/a.ts');
	expect(deleted.status, deleted.stderr).toBe(0);
	expect(deleted.stdout).not.toContain('Current reason');
	expect(deleted.stdout).toContain('absence is not established');
	expect(readFileSync(join(root, '.void/knowledge.json'), 'utf8')).toBe(
		artifact,
	);
});
