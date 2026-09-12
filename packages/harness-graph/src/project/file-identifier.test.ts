import { describe, expect, it } from 'vitest';
import { isProjectFileIdentifier, sameProjectFileIdentifier, nativeFileIdentity, readFileIdentity } from './file-identifier.js';

describe('lossless native file identifiers', () => {
	it('preserves optional numeric fields only when exact and always emits the portable pair', () => {
		expect(nativeFileIdentity(7n, 42n)).toEqual({ device: 7, inode: 42, identity: { device: '7', inode: '42' } });
		expect(nativeFileIdentity(7n, 9007199254740993n)).toEqual({ device: 7, identity: { device: '7', inode: '9007199254740993' } });
	});
	it('refuses contradictory or incomplete pairs instead of trusting a legacy fallback', () => {
		expect(readFileIdentity({ identity: { device: '7', inode: '42' }, inode: 43 })).toBeUndefined();
		expect(readFileIdentity({ identity: { inode: '42' }, device: 7, inode: 42 })).toBeUndefined();
		expect(readFileIdentity({ device: 7 })).toBeUndefined();
		expect(readFileIdentity({ device: 7, inode: 42 })).toEqual({ device: '7', inode: '42' });
	});
	it.each(['0', '9007199254740992', '9007199254740993', '18446744073709551615', 0, 42])(
		'accepts exact identifiers and safe legacy numbers: %s', (value) => {
			expect(isProjectFileIdentifier(value)).toBe(true);
		},
	);
	it.each(['', '01', '+1', '-1', '1.5', '1e3', '18446744073709551616', '9'.repeat(21),
		-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
		'refuses malformed, out-of-range or already rounded identifiers: %s', (value) => {
			expect(isProjectFileIdentifier(value)).toBe(false);
		},
	);
	it('compares safe legacy values without collapsing adjacent wide identifiers', () => {
		expect(sameProjectFileIdentifier(42, '42')).toBe(true);
		expect(sameProjectFileIdentifier('9007199254740992', '9007199254740993')).toBe(false);
		expect(sameProjectFileIdentifier(Number.MAX_SAFE_INTEGER + 1, '9007199254740992')).toBe(false);
	});
});
