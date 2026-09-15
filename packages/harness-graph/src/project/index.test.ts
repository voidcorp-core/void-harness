import { describe, expect, it } from 'vitest';
import { PROJECT_KNOWLEDGE_SCHEMA_VERSION, serializeProjectKnowledge } from './index.js';

describe('project public exports', () => {
	it('exports the knowledge artifact contract', () => {
		expect(PROJECT_KNOWLEDGE_SCHEMA_VERSION).toBe(1);
		expect(serializeProjectKnowledge).toBeTypeOf('function');
	});
});
