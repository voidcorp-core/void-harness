import type {
  NormalizedEdit,
  RuleVerdict,
} from '../enforcement/types.js';
import {
  evidenceVerdict,
  isTestPath,
  lineEvidence,
} from './source-helpers.js';

const GENERIC_NAME =
  /\b(?:it|test)\(\s*['"]should\s|\b(?:it|test)\(\s*['"]works?\b|\b(?:it|test)\(\s*['"]test['"]/;

export function testName(edits: readonly NormalizedEdit[]): RuleVerdict {
  return evidenceVerdict(
    'GENERIC_TEST_NAME',
    'generic test name must describe observable behavior',
    lineEvidence(edits, isTestPath, (line) => GENERIC_NAME.test(line)),
  );
}
