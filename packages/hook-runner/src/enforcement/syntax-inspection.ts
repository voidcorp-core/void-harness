import { SYNTAX_OPERATION_BUDGET_MS, type SyntaxPurpose } from './syntax-contract.js';
import type { RuleVerdict } from './types.js';
import { MAX_SOURCE_BYTES } from './proposed-source.js';
import { runSyntaxWorker } from './syntax-process.js';
import { syntaxVerdict, unavailableSyntax } from './syntax-policy.js';
export { syntaxVerdict, unavailableSyntax } from './syntax-policy.js';

export function inspectSourceSyntax(root: string, path: string, source: string,
  remainingMs = SYNTAX_OPERATION_BUDGET_MS, purpose: SyntaxPurpose = 'focused-tests'): RuleVerdict {
  if (Buffer.byteLength(source) > MAX_SOURCE_BYTES) return unavailableSyntax('file exceeds 64 KiB', path);
  if (remainingMs < 1) return unavailableSyntax('operation exhausted its five-second parsing budget', path, 'split the operation into smaller edits');
  const result = runSyntaxWorker(root, { path, source, purpose }, remainingMs);
  switch (result.kind) {
    case 'inspected': return syntaxVerdict({ lines: result.lines }, path, purpose);
    case 'invalid-source': return unavailableSyntax('source could not be parsed within the supported limits', path);
    case 'limit': return unavailableSyntax('parser process failed or exceeded its resource limit', path);
    case 'invalid-request':
    case 'unavailable': return unavailableSyntax('bundled syntax parser is unavailable', path);
  }
}
