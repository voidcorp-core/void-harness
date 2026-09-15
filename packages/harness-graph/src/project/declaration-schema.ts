// tdd-cover: e2e packages/harness-graph/src/project/declarations.test.ts
/** Data validation follows this package's existing explicit boundary validators. */
export type ProjectDeclaration =
	| {
			readonly kind: 'decision';
			readonly id: string;
			readonly title: string;
			readonly status: string;
			readonly supersedes: readonly string[];
			readonly affects: readonly string[];
	  }
	| {
			readonly kind: 'invariant';
			readonly id: string;
			readonly scope: string;
			readonly severity: string;
			readonly statement: string;
			readonly enforced_by: readonly string[];
			readonly verified_by: readonly string[];
			readonly decided_by: readonly string[];
	  };
export type DeclarationExtraction =
	| { readonly ok: true; readonly value: ProjectDeclaration }
	| { readonly ok: false; readonly message: string };

function invalid(field: string): never {
	throw new Error(`invalid declaration field: ${field}`);
}
function text(value: unknown, field: string, max = 512): string {
	if (typeof value !== 'string' || value.length === 0 || value.length > max)
		invalid(field);
	if (
		[...value].some((c) => {
			const n = c.codePointAt(0) ?? 0;
			return n < 32 || (n >= 127 && n <= 159);
		})
	)
		invalid(field);
	return value;
}
function list(
	value: unknown,
	field: string,
	optional = false,
): readonly string[] {
	if (optional && value === undefined) return Object.freeze([]);
	if (!Array.isArray(value) || value.length > 256) invalid(field);
	return Object.freeze(
		[...new Set(value.map((v) => text(v, field, 1024)))].sort(),
	);
}
function choice(
	value: unknown,
	field: string,
	choices: readonly string[],
): string {
	const parsed = text(value, field, 32);
	if (!choices.includes(parsed)) invalid(field);
	return parsed;
}
export function validateProjectDeclaration(
	value: unknown,
	kind: 'decision' | 'invariant',
): ProjectDeclaration {
	if (
		typeof value !== 'object' ||
		value === null ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	)
		invalid('document');
	// Object.entries gives unknown values without casting an untrusted mapping.
	const fields = new Map<string, unknown>(Object.entries(value));
	const id = text(fields.get('id'), 'id', 256);
	if (!/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(id)) invalid('id');
	if (kind === 'decision')
		return Object.freeze({
			kind,
			id,
			title: text(fields.get('title'), 'title'),
			status: choice(fields.get('status'), 'status', [
				'proposed',
				'accepted',
				'rejected',
				'deprecated',
				'superseded',
			]),
			supersedes: list(fields.get('supersedes'), 'supersedes', true),
			affects: list(fields.get('affects'), 'affects', true),
		});
	return Object.freeze({
		kind,
		id,
		scope: text(fields.get('scope'), 'scope', 256),
		severity: choice(fields.get('severity'), 'severity', [
			'critical',
			'high',
			'medium',
			'low',
			'warning',
			'error',
			'info',
		]),
		statement: text(fields.get('statement'), 'statement'),
		enforced_by: list(fields.get('enforced_by'), 'enforced_by'),
		verified_by: list(fields.get('verified_by'), 'verified_by'),
		decided_by: list(fields.get('decided_by'), 'decided_by'),
	});
}
