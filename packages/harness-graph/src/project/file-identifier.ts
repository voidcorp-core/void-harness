import type { ProjectFileIdentityFields, ProjectPortableStatIdentity } from './extractors/types.js';

/** Native adapters emit decimal strings; safe numbers remain readable in v1 caches. */
export type ProjectFileIdentifier = string | number;

export function isProjectFileIdentifier(value: unknown): value is ProjectFileIdentifier {
	if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0;
	return typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value)
		&& BigInt(value) <= 18_446_744_073_709_551_615n;
}

export function sameProjectFileIdentifier(left: ProjectFileIdentifier, right: ProjectFileIdentifier): boolean {
	return isProjectFileIdentifier(left) && isProjectFileIdentifier(right) && String(left) === String(right);
}

/** A complete exact pair, or safe legacy evidence. Contradictions never fall back. */
export function readFileIdentity(value: unknown): ProjectPortableStatIdentity | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
	const fields = value as Record<string, unknown>;
	for (const name of ['device', 'inode']) {
		if (fields[name] !== undefined && (typeof fields[name] !== 'number' || !isProjectFileIdentifier(fields[name]))) return undefined;
	}
	const exact = fields['identity'];
	if (exact === undefined) {
		return fields['device'] === undefined || fields['inode'] === undefined ? undefined
			: Object.freeze({ device: String(fields['device']), inode: String(fields['inode']) });
	}
	if (typeof exact !== 'object' || exact === null || Array.isArray(exact)) return undefined;
	const pair = exact as Record<string, unknown>;
	if (Object.keys(pair).some((key) => key !== 'device' && key !== 'inode')) return undefined;
	if (typeof pair['device'] !== 'string' || !isProjectFileIdentifier(pair['device'])
		|| typeof pair['inode'] !== 'string' || !isProjectFileIdentifier(pair['inode'])) return undefined;
	if ((fields['device'] !== undefined && String(fields['device']) !== pair['device'])
		|| (fields['inode'] !== undefined && String(fields['inode']) !== pair['inode'])) return undefined;
	return Object.freeze({ device: pair['device'], inode: pair['inode'] });
}

export function nativeFileIdentity(device: bigint, inode: bigint): ProjectFileIdentityFields {
	const maximum = BigInt(Number.MAX_SAFE_INTEGER);
	return Object.freeze({
		identity: Object.freeze({ device: device.toString(), inode: inode.toString() }),
		...(device >= 0n && device <= maximum ? { device: Number(device) } : {}),
		...(inode >= 0n && inode <= maximum ? { inode: Number(inode) } : {}),
	});
}
