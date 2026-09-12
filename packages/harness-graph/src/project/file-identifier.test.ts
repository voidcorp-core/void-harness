import { describe, expect, it } from 'vitest';
import { isProjectFileIdentifier, sameProjectFileIdentifier } from './file-identifier.js';

describe('lossless native file identifiers', () => {
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
