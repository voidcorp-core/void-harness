import { describe, expect, it } from 'vitest';
import { projectFileId, projectSymbolId } from './types.js';

describe('ProjectGraph identities', () => {
	it('keeps file and symbol identities stable for the same logical source', () => {
		expect(projectFileId('packages/core/src/index.ts')).toBe(
			projectFileId('packages/core/src/index.ts'),
		);
		expect(projectSymbolId('packages/core/src/index.ts', 'CorePort')).toBe(
			projectSymbolId('packages/core/src/index.ts', 'CorePort'),
		);
		expect(projectFileId('packages/core/src/renamed.ts')).not.toBe(
			projectFileId('packages/core/src/index.ts'),
		);
	});
});
