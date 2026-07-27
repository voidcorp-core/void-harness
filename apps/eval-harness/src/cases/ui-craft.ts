import { loadFixture } from '../fixture-loader.js';
import { uiCraftScorer } from '../scorers.js';
import type { EvalCase } from '../types.js';

export const UI_CRAFT_CASE: EvalCase = {
  skill: 'ui-review',
  title: 'reject and repair a generic generated interface with deterministic proof',
  prompt:
    'Audit and polish this existing product UI. Reject generic AI visual reflexes, preserve the ' +
    'DESIGN.md direction, cover default and error states, and add responsive and focus treatment. ' +
    'Write artifacts/ui-quality.json with one current diffHash, mobile and desktop entries for each ' +
    'state, at least one passing behavioral test entry, and all six craft scores. Do not claim ' +
    'completion unless every score is at least 8/10.',
  fixture: loadFixture('ui/ui-craft', [
    'DESIGN.md',
    'index.html',
    'styles.css',
  ]),
  scorer: uiCraftScorer,
};
