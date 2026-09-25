import { isAbsolute, relative, resolve } from 'node:path';
import type {
	GraphEdgeV3,
	GraphNodeV3,
	GraphProvenance,
} from '@voidcorp/harness-graph';
import {
	DEFAULT_PROJECT_QUERY_BUDGET,
	normalizeProjectPath,
	projectFileId,
	type ProjectGraphBuildResult,
	type ProjectQueryBudget,
} from '@voidcorp/harness-graph/project';
import { PRODUCT_COMMAND } from '@voidcorp/hook-runner';

type WhyBuild = Pick<ProjectGraphBuildResult, 'graph' | 'state' | 'issues'>;
export type WhyTarget =
	| { readonly ok: true; readonly path: string }
	| { readonly ok: false; readonly problem: string; readonly fix: string };
export interface ProjectWhyReport {
	readonly lines: readonly string[];
	readonly exitCode: 0 | 2;
}
/** Terminal controls are data, never terminal instructions; each field is bounded. */
export function whyText(value: string, maximum = 1024): string {
	const inert = [...value.slice(0, maximum + 1)]
		.map((character) => {
			const point = character.codePointAt(0) ?? 0;
			return point < 32 ||
				(point >= 127 && point <= 159) ||
				(point >= 0x202a && point <= 0x202e) ||
				(point >= 0x2066 && point <= 0x2069)
				? '\uFFFD'
				: character;
		})
		.join('');
	return inert.length <= maximum
		? inert
		: `${inert.slice(0, maximum)} [truncated]`;
}
export function projectWhyTarget(
	root: string,
	args: readonly string[],
): WhyTarget {
	const raw = args[0];
	if (args.length !== 1 || raw === undefined || raw.startsWith('-'))
		return {
			ok: false,
			problem: 'why expects exactly one file path and no options',
			fix: `${PRODUCT_COMMAND} why <file>`,
		};
	try {
		const path = normalizeProjectPath(
			isAbsolute(raw) ? relative(resolve(root), raw) : raw,
		);
		if (path === '.') throw new Error('file required');
		return { ok: true, path };
	} catch {
		return {
			ok: false,
			problem: 'why target must be a file inside the project root',
			fix: 'use a project-relative file path',
		};
	}
}
function provenance(value: GraphProvenance): string {
	return `${value.origin}, confidence ${value.confidence}; ${value.sources.map((s) => `${s.ref} ${s.hashOrVersion}`).join('; ')}`;
}
interface Selection {
	readonly nodes: readonly GraphNodeV3[];
	readonly verifications: readonly { node: GraphNodeV3; edge: GraphEdgeV3 }[];
	readonly truncated: boolean;
}
function select(
	build: WhyBuild,
	path: string,
	budget: ProjectQueryBudget,
): Selection {
	const byId = new Map(build.graph.nodes.map((n) => [n.id, n]));
	const outgoing = new Map<string, GraphEdgeV3[]>();
	for (const edge of build.graph.edges) {
		if (
			edge.provenance.origin !== 'declared' ||
			!['decided_by', 'constrained_by', 'verified_by'].includes(edge.kind)
		)
			continue;
		const edges = outgoing.get(edge.from) ?? [];
		edges.push(edge);
		outgoing.set(edge.from, edges);
	}
	for (const edges of outgoing.values())
		edges.sort((a, b) => a.to.localeCompare(b.to) || a.id.localeCompare(b.id));
	const seed = projectFileId(path);
	const seen = new Set([seed]);
	const queue = [{ id: seed, depth: 0 }];
	const nodes: GraphNodeV3[] = [];
	const verifications: { node: GraphNodeV3; edge: GraphEdgeV3 }[] = [];
	let truncated = false;
	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index];
		if (current === undefined) break;
		for (const edge of outgoing.get(current.id) ?? []) {
			const node = byId.get(edge.to);
			if (node === undefined) continue;
			if (!seen.has(node.id)) {
				if (seen.size >= budget.maxNodes || current.depth >= budget.maxDepth) {
					truncated = true;
					continue;
				}
				seen.add(node.id);
				// Verification files terminate traversal; their other unrelated declarations do not explain the target.
				if (edge.kind !== 'verified_by') {
					queue.push({ id: node.id, depth: current.depth + 1 });
					nodes.push(node);
				}
			}
			if (edge.kind === 'verified_by') verifications.push({ node, edge });
		}
	}
	return { nodes, verifications, truncated };
}
function declarationLine(node: GraphNodeV3): string {
	const supersedes = node.data['supersedes'];
	const chain =
		Array.isArray(supersedes) && supersedes.length > 0
			? `; supersedes: ${supersedes.join(', ')}`
			: '';
	const state =
		node.kind === 'decision' ? node.data['status'] : node.data['severity'];
	return `${String(node.data['declarationId'] ?? node.id)} ${node.label} (${String(state ?? '')}${chain}) [${provenance(node.provenance)}]`;
}
function appendSelection(
	selected: Selection,
	append: (line: string) => void,
): void {
	for (const [kind, heading] of [
		['decision', 'Decisions'],
		['invariant', 'Invariants'],
	] as const) {
		append(heading);
		for (const node of selected.nodes
			.filter((n) => n.kind === kind)
			.sort((a, b) =>
				String(a.data['declarationId']).localeCompare(
					String(b.data['declarationId']),
				),
			))
			append(`  ${declarationLine(node)}`);
	}
	append('Verifications');
	for (const { node, edge } of [...selected.verifications].sort(
		(a, b) =>
			String(a.node.data['path']).localeCompare(String(b.node.data['path'])) ||
			a.edge.id.localeCompare(b.edge.id),
	))
		append(
			`  ${String(node.data['path'] ?? node.label)} [${provenance(edge.provenance)}]`,
		);
}
function appendDiagnostics(
	build: WhyBuild,
	append: (line: string) => void,
): void {
	const diagnostics = build.issues.filter((i) =>
		i.code.startsWith('knowledge-'),
	);
	for (const issue of diagnostics.filter(
		(i) => i.code === 'knowledge-truncated',
	))
		append(`Knowledge diagnostics truncated: ${issue.message}`);
	if (diagnostics.length > 0) {
		append('Knowledge diagnostics');
		for (const issue of diagnostics.slice(0, 50))
			append(
				`  ${whyText(issue.path)}: ${whyText(issue.message)} (${issue.code})`,
			);
		if (diagnostics.length > 50)
			append(
				`Knowledge diagnostics truncated: ${diagnostics.length - 50} additional issue(s).`,
			);
	}
}
export function renderProjectWhy(
	build: WhyBuild,
	path: string,
	budget: ProjectQueryBudget = DEFAULT_PROJECT_QUERY_BUDGET,
): ProjectWhyReport {
	const lines: string[] = [];
	let characters = 0;
	let omitted = false;
	const append = (value: string): void => {
		const safe = whyText(value, 2048);
		if (characters + safe.length + 1 > 64_000) {
			omitted = true;
			return;
		}
		lines.push(safe);
		characters += safe.length + 1;
	};
	if (build.state !== 'fresh')
		append(
			`${build.state}: information may be missing; confirm against declaration sources. Any absence is not established.`,
		);
	append(path);
	const exists = build.graph.nodes.some(
		(n) => n.id === projectFileId(path) && n.data['state'] === 'active',
	);
	if (!exists && build.state === 'fresh') {
		append(
			`Target ${path} is absent from the complete graph. Use an existing project file.`,
		);
		return { lines, exitCode: 2 };
	}
	const selected = select(build, path, budget);
	appendSelection(selected, append);
	if (selected.nodes.length === 0)
		append(
			build.state === 'fresh' && !selected.truncated
				? `No declared decision or invariant for ${path}`
				: `No declaration found for ${path}; absence is not established.`,
		);
	if (selected.truncated)
		append(
			'Traversal truncated: additional declared knowledge may be omitted.',
		);
	appendDiagnostics(build, append);
	if (omitted)
		lines.push(
			'Output truncated at 64000 characters; consult declaration sources.',
		);
	return { lines: Object.freeze(lines), exitCode: 0 };
}
