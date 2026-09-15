import { posix } from 'node:path';
import {
	isAlias,
	isCollection,
	isNode,
	isPair,
	isScalar,
	parseDocument,
} from 'yaml';
import {
	type DeclarationExtraction,
	validateProjectDeclaration,
} from '../declaration-schema.js';

export function declarationKind(
	path: string,
): 'decision' | 'invariant' | undefined {
	if (/^docs\/decisions-log\/[^/]+\.md$/.test(path)) return 'decision';
	if (/^\.void\/knowledge\/invariants\/[^/]+\.yaml$/.test(path))
		return 'invariant';
	return undefined;
}
function inspectNodes(root: unknown): void {
	const pending: { value: unknown; depth: number }[] = [
		{ value: root, depth: 0 },
	];
	let count = 0;
	while (pending.length > 0) {
		const next = pending.pop();
		if (next === undefined) break;
		count += 1;
		if (count > 10_000 || next.depth > 64)
			throw new Error('declaration exceeds 10000 nodes or 64 levels');
		const node = next.value;
		if (isAlias(node)) throw new Error('declaration aliases are not supported');
		if (isNode(node) && node.tag !== undefined)
			throw new Error('explicit declaration tags are not supported');
		if (isPair(node)) {
			if (
				!isScalar(node.key) ||
				typeof node.key.value !== 'string' ||
				['__proto__', 'prototype', 'constructor', '<<'].includes(node.key.value)
			)
				throw new Error('declaration has an unsafe mapping key');
			pending.push(
				{ value: node.key, depth: next.depth + 1 },
				{ value: node.value, depth: next.depth + 1 },
			);
		} else if (isCollection(node)) {
			if (pending.length + node.items.length + count > 10_000)
				throw new Error('declaration exceeds 10000 nodes');
			for (const value of node.items)
				pending.push({ value, depth: next.depth + 1 });
		}
	}
}
function normalizeLegacyDecision(
	decoded: unknown,
	path: string,
	kind: 'decision' | 'invariant',
): unknown {
	if (
		kind === 'decision' &&
		typeof decoded === 'object' &&
		decoded !== null &&
		!Array.isArray(decoded)
	) {
		const fields = new Map<string, unknown>(Object.entries(decoded));
		if (
			fields.get('id') === undefined &&
			fields.get('schemaVersion') === undefined
		) {
			const date = fields.get('date');
			if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
				throw new Error('legacy ADR requires date and title');
			decoded = {
				id: `legacy:${posix.basename(path, '.md')}`,
				title: fields.get('title'),
				status: 'accepted',
				supersedes: [],
				affects: fields.get('affects'),
			};
		}
	}
	return decoded;
}
export function extractProjectDeclaration(
	path: string,
	content: string,
): DeclarationExtraction | undefined {
	const kind = declarationKind(path);
	if (kind === undefined) return undefined;
	try {
		let yaml = content;
		if (kind === 'decision') {
			const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
				content,
			);
			if (match?.[1] === undefined)
				throw new Error('ADR frontmatter is missing or unterminated');
			yaml = match[1];
		}
		// yaml 2.9.0: https://github.com/eemeli/yaml/blob/v2.9.0/src/options.ts
		// No custom resolver; diagnostics contain only bounded reasons, never source excerpts.
		const document = parseDocument(yaml, {
			strict: true,
			uniqueKeys: true,
			stringKeys: true,
			version: '1.2',
			schema: 'core',
			resolveKnownTags: false,
			merge: false,
			prettyErrors: false,
		});
		if (document.errors.length > 0 || document.warnings.length > 0)
			throw new Error('invalid YAML or unsupported tag');
		inspectNodes(document.contents);
		let decoded: unknown = document.toJS({ maxAliasCount: 0 });
		decoded = normalizeLegacyDecision(decoded, path, kind);
		return Object.freeze({
			ok: true,
			value: validateProjectDeclaration(decoded, kind),
		});
	} catch (error) {
		return Object.freeze({
			ok: false,
			message:
				error instanceof Error
					? error.message.slice(0, 256)
					: 'invalid declaration',
		});
	}
}
