import { describe, expect, it } from 'vitest';
import { loadSecondary } from './index.js';

describe('loadSecondary', () => {
	it('loads the aliased module dynamically', async () => {
		expect((await loadSecondary()).value).toContain('function');
	});
});
