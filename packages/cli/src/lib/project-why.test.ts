import { describe, expect, it } from 'vitest';
import type { GraphSnapshotV3 } from '@voidcorp/harness-graph';
import { projectFileId } from '@voidcorp/harness-graph/project';
import { projectWhyTarget, renderProjectWhy } from './project-why.js';
const provenance = {
	origin: 'declared',
	confidence: 1,
	sources: [
		{
			kind: 'path',
			ref: 'docs/decisions-log/a.md',
			hashOrVersion: `sha256:${'a'.repeat(64)}`,
		},
	],
} as const;
const target = projectFileId('src/a.ts');
function graph(): GraphSnapshotV3 {
	return {
		schemaVersion: 3,
		graphId: 'project:current',
		graphType: 'project',
		source: {
			kind: 'native',
			version: 'test',
			rootHash: `sha256:${'b'.repeat(64)}`,
		},
		hyperedges: [],
		nodes: [
			{
				id: target,
				kind: 'source',
				label: 'a.ts',
				data: { path: 'src/a.ts', state: 'active' },
				provenance,
			},
			{
				id: 'project:decision:a',
				kind: 'decision',
				label: 'Keep A',
				data: {
					declarationId: 'adr:a',
					status: 'accepted',
					supersedes: ['adr:old'],
				},
				provenance,
			},
			{
				id: 'project:invariant:a',
				kind: 'invariant',
				label: 'Protect A',
				data: { declarationId: 'INV-A', severity: 'critical' },
				provenance,
			},
			{
				id: 'project:test:a',
				kind: 'test',
				label: 'a.test.ts',
				data: { path: 'tests/a.test.ts' },
				provenance: { ...provenance, origin: 'extracted' },
			},
		],
		edges: [
			{
				id: 'project:edge:a',
				kind: 'decided_by',
				from: target,
				to: 'project:decision:a',
				data: {},
				provenance,
			},
			{
				id: 'project:edge:b',
				kind: 'constrained_by',
				from: target,
				to: 'project:invariant:a',
				data: {},
				provenance,
			},
			{
				id: 'project:edge:c',
				kind: 'verified_by',
				from: 'project:invariant:a',
				to: 'project:test:a',
				data: {},
				provenance,
			},
		],
	};
}
describe('why input contract', () => {
	it('normalizes one in-root path', () => {
		expect(projectWhyTarget('/project', ['src/../src/a.ts'])).toEqual({
			ok: true,
			path: 'src/a.ts',
		});
		expect(projectWhyTarget('/project', ['/project/src/a.ts'])).toEqual({
			ok: true,
			path: 'src/a.ts',
		});
	});
	it.each(
		[
			[],
			['a', 'b'],
			['--json'],
			['--format', 'json'],
			['-x'],
			['../outside'],
			['/outside'],
		].map((args) => ({ args })),
	)('refuses invalid arguments before reading: %j', ({ args }) => {
		expect(projectWhyTarget('/project', args).ok).toBe(false);
	});
});
it('renders declared decisions, invariants and verification evidence with source hashes and supersession', () => {
	const report = renderProjectWhy(
		{ graph: graph(), state: 'fresh', issues: [] },
		'src/a.ts',
	);
	const output = report.lines.join('\n');
	expect(report.exitCode).toBe(0);
	for (const value of [
		'Decisions',
		'Invariants',
		'Verifications',
		'adr:a',
		'INV-A',
		'tests/a.test.ts',
		'supersedes: adr:old',
		'declared',
		'confidence 1',
		provenance.sources[0].hashOrVersion,
	])
		expect(output).toContain(value);
	expect(output).not.toContain('extracted');
});
it('distinguishes complete absence, absent target and partial unknown', () => {
	const empty = { ...graph(), edges: [] };
	expect(
		renderProjectWhy(
			{ graph: empty, state: 'fresh', issues: [] },
			'src/a.ts',
		).lines.join('\n'),
	).toContain('No declared decision or invariant for src/a.ts');
	expect(
		renderProjectWhy({ graph: empty, state: 'fresh', issues: [] }, 'missing.ts')
			.exitCode,
	).toBe(2);
	const partial = renderProjectWhy(
		{ graph: empty, state: 'partial', issues: [] },
		'missing.ts',
	);
	expect(partial.exitCode).toBe(0);
	expect(partial.lines[0]).toContain('partial');
	expect(partial.lines.join('\n')).toContain('absence is not established');
});
it('announces traversal and diagnostic truncation and neutralizes terminal controls', () => {
	const dirty = graph();
	const nodes = dirty.nodes.map((n) =>
		n.kind === 'decision'
			? { ...n, label: '\u001b]52;c;ATTACK\u0007title\u009b2J' }
			: n,
	);
	const issues = Array.from({ length: 200 }, (_, i) => ({
		code: 'knowledge-reference' as const,
		path: 'a\u001b[2J',
		message: `missing ${i} ${'x'.repeat(5000)}`,
	}));
	const report = renderProjectWhy(
		{ graph: { ...dirty, nodes }, state: 'degraded', issues },
		'src/a.ts',
		{ maxNodes: 2, maxDepth: 1 },
	);
	const out = report.lines.join('\n');
	expect(out).toContain('truncated');
	expect(out).toContain('Knowledge diagnostics');
	expect(
		[...out].some((c) => {
			const n = c.codePointAt(0) ?? 0;
			return (n < 32 && n !== 10) || (n >= 127 && n <= 159);
		}),
	).toBe(false);
	expect(out.length).toBeLessThan(100000);
});
