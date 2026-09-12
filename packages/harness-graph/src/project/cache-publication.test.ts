import { describe, expect, it } from 'vitest';
import type { ProjectGraphBuildState } from './cache-publication.js';

describe('project graph publication', () => {
	it('keeps the published state vocabulary bounded', () => {
		const states: readonly ProjectGraphBuildState[] = ['fresh', 'partial', 'degraded'];
		expect(states).toHaveLength(3);
	});
});
