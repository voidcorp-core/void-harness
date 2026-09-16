// tdd-cover: e2e packages/hook-runner/src/enforcement/syntax-worker.test.ts
export const SYNTAX_OPERATION_BUDGET_MS = 5_000;
export type SyntaxPurpose = 'focused-tests' | 'declarations';
export interface SyntaxInput {
  readonly path: string;
  readonly source: string;
  readonly purpose: SyntaxPurpose;
}
export type SyntaxResult =
  | { readonly version: 1; readonly kind: 'inspected'; readonly lines: readonly number[] }
  | { readonly version: 1; readonly kind: 'invalid-request' | 'invalid-source' | 'limit' | 'unavailable' };

export function syntaxInput(value: unknown): SyntaxInput | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (!('version' in value) || value.version !== 1
    || !('path' in value) || typeof value.path !== 'string' || value.path.length > 4_096
    || !('source' in value) || typeof value.source !== 'string'
    || !('purpose' in value) || (value.purpose !== 'focused-tests' && value.purpose !== 'declarations')) return undefined;
  return { path: value.path, source: value.source, purpose: value.purpose };
}

export function syntaxResult(value: unknown): SyntaxResult | undefined {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('kind' in value)) return undefined;
  if (value.kind === 'invalid-request' || value.kind === 'invalid-source'
    || value.kind === 'limit' || value.kind === 'unavailable') return { version: 1, kind: value.kind };
  if (value.kind !== 'inspected' || !('lines' in value) || !Array.isArray(value.lines)
    || value.lines.length > 20_000 || !value.lines.every((line): line is number =>
      Number.isSafeInteger(line) && line > 0 && line <= 65_537)) return undefined;
  return { version: 1, kind: 'inspected', lines: value.lines };
}
