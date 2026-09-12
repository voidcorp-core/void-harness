import { describe, expect, it } from 'vitest';
import { parseProjectGraphCache, sealProjectGraphCache } from './cache-codec.js';

function fixture(inode: string | number) {
	return sealProjectGraphCache({
		schemaVersion: 1, rootKey: `sha256:${'a'.repeat(64)}`,
		extractionKey: 'project-extraction-v1:fixture@1',
		snapshotId: `sha256:${'b'.repeat(64)}`, graphRootHash: `sha256:${'c'.repeat(64)}`,
		gitHead: null, tombstones: [],
		entries: [{
			path: 'file.ts', size: 0, mtimeMs: 0, inode, device: 1,
			hash: `sha256:${'d'.repeat(64)}`, kind: 'source',
			extraction: { imports: [], exports: [], symbols: [], tests: [], diagnostics: [], unresolved: [] },
		}],
	});
}

describe('file identity cache wire compatibility', () => {
	it('reads a safe numeric v1 entry without rewriting its signed payload', () => {
		const original = fixture(42);
		expect(parseProjectGraphCache(original)).toEqual(original);
	});
	it('preserves exact wide identifiers through JSON transport', () => {
		const original = fixture('18446744073709551615');
		expect(parseProjectGraphCache(JSON.parse(JSON.stringify(original)))).toEqual(original);
	});
	it.each([Number.MAX_SAFE_INTEGER + 1, '01', '18446744073709551616'])(
		'rejects invalid identifiers even with a matching payload checksum: %s', (inode) => {
			expect(() => parseProjectGraphCache(fixture(inode))).toThrow('PROJECT_CACHE_INVALID');
		},
	);
});
