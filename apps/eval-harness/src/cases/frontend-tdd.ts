import { loadFixture } from '../fixture-loader.js';
import { frontendTddScorer } from '../scorers.js';
import type { EvalCase } from '../types.js';

export const FRONTEND_TDD_CASE: EvalCase = {
  skill: 'tdd',
  title: 'fix an interactive keyboard regression test-first',
  prompt:
    'The ActionMenu opens with a pointer but not with the keyboard. Fix that behavior test-first. ' +
    'Use accessible queries and keep the change at component-test level; do not add an E2E test.',
  fixture: loadFixture('ui/frontend-tdd', [
    'package.json',
    'src/ActionMenu.tsx',
    'vitest.config.ts',
  ]),
  scorer: frontendTddScorer({ targetSymbol: 'ActionMenu' }),
};
