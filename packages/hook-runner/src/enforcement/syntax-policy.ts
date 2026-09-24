// tdd-cover: e2e packages/hook-runner/src/enforcement/syntax-analysis.test.ts
import type { SyntaxPurpose } from './syntax-contract.js';
import type { RuleVerdict } from './types.js';

export function unavailableSyntax(reason: string, path: string,
  correction = 'provide valid complete source within the limits; if the bundled parser is unavailable, repair the harness installation, then retry'): RuleVerdict {
  return { allow: false, code: 'TEST_SYNTAX_UNVERIFIED',
    message: `source syntax verification unavailable: ${reason}; ${correction}`,
    evidence: [path] };
}

/** Validate the child protocol before interpreting its syntax evidence. */
export function syntaxVerdict(result: unknown, path: string, purpose: SyntaxPurpose): RuleVerdict {
  try {
    if (!result || typeof result !== 'object') throw new Error();
    if ('unavailable' in result && typeof result.unavailable === 'string') {
      const permitted = ['bundled syntax parser is unavailable',
        'source could not be parsed within the supported limits'];
      return unavailableSyntax(permitted.includes(result.unavailable)
        ? result.unavailable : 'parser returned an invalid result', path);
    }
    const lines = 'lines' in result ? result.lines : undefined;
    if (!Array.isArray(lines) || lines.length > 20_000
      || !lines.every((line): line is number => Number.isSafeInteger(line) && line > 0)) throw new Error();
    if (purpose === 'declarations') return lines.length === 0 || (lines.length === 1 && lines[0] === 1)
      ? { allow: true, code: lines.length === 0 ? 'TDD_DECLARATION_NONE' : 'TDD_DECLARATION_HEADER',
        message: 'declaration comment syntax checked', evidence: [] }
      : { allow: false, code: 'TDD_DECLARATION_INVALID',
        message: 'put exactly one E2E declaration comment on the first line', evidence: [path] };
    return lines.length === 0
      ? { allow: true, code: 'OK', message: 'focused-test syntax checked', evidence: [] }
      : { allow: false, code: 'FOCUSED_OR_SKIPPED_TEST', message: 'focused or skipped test detected; use todo only for explicitly pending coverage',
        evidence: lines.map((line) => `${path}:${line}`) };
  } catch {
    return unavailableSyntax('parser returned an invalid result', path);
  }
}
