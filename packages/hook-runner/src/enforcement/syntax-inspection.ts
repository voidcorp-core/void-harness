import { spawnSync } from 'node:child_process';
import type { analyzeSyntax, SyntaxPurpose } from './syntax-analysis.js';
import type { RuleVerdict } from './types.js';
import { MAX_SOURCE_BYTES } from './proposed-source.js';
import { SYNTAX_PARSER_GZIP } from './syntax-parser.generated.js';

/** Self-contained child entry: its compiled function body is the fixed program. */
function syntaxWorker(): void {
  // Node >=22.3 supplies builtins without a bundler-owned require helper.
  // https://nodejs.org/docs/latest-v22.x/api/process.html#processgetbuiltinmoduleid
  const { readFileSync } = process.getBuiltinModule('node:fs');
  const { gunzipSync } = process.getBuiltinModule('node:zlib');
  let reason = 'bundled syntax parser is unavailable';
  try {
    const { parser, ...input } = JSON.parse(readFileSync(0, 'utf8')) as {
      parser: string; path: string; source: string; purpose: SyntaxPurpose;
    };
    const program = gunzipSync(Buffer.from(parser, 'base64'), { maxOutputLength: 8 * 1024 * 1024 }).toString('utf8');
    // Only the harness-owned program is executable. Proposed source stays data.
    // Builtin-only resolution cannot load consumer packages, config or plugins.
    const analyze: typeof analyzeSyntax = new Function('require', `${program}; return harnessSyntaxParser.analyzeSyntax;`)(process.getBuiltinModule);
    reason = 'source could not be parsed within the supported limits';
    process.stdout.write(JSON.stringify(analyze(input)));
  } catch {
    process.stdout.write(JSON.stringify({ unavailable: reason }));
  }
}

export function unavailableSyntax(reason: string, path: string,
  correction = 'provide valid complete source within the limits; if the bundled parser is unavailable, repair the harness installation, then retry'): RuleVerdict {
  return { allow: false, code: 'TEST_SYNTAX_UNVERIFIED',
    message: `source syntax verification unavailable: ${reason}; ${correction}`,
    evidence: [path] };
}

export function inspectSourceSyntax(root: string, path: string, source: string, remainingMs = 1_000,
  purpose: SyntaxPurpose = 'focused-tests'): RuleVerdict {
  if (Buffer.byteLength(source) > MAX_SOURCE_BYTES) return unavailableSyntax('file exceeds 64 KiB', path);
  if (remainingMs < 1) return unavailableSyntax('operation exhausted its one-second parsing budget', path, 'split the operation into smaller edits');
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', '--eval', `(${syntaxWorker.toString()})()`], {
    cwd: root, env: {}, encoding: 'utf8', timeout: Math.min(1_000, Math.ceil(remainingMs)), killSignal: 'SIGKILL', maxBuffer: 65_536,
    input: JSON.stringify({ parser: SYNTAX_PARSER_GZIP, path, source, purpose }), windowsHide: true,
  });
  if (child.error !== undefined || child.status !== 0) return unavailableSyntax('parser process failed or exceeded its resource limit', path);
  try {
    return syntaxVerdict(JSON.parse(child.stdout), path, purpose);
  } catch {
    return unavailableSyntax('parser returned an invalid result', path);
  }
}

/** Validate the child protocol before interpreting its syntax evidence. */
export function syntaxVerdict(result: unknown, path: string, purpose: SyntaxPurpose): RuleVerdict {
  try {
    if (typeof result !== 'object' || result === null) throw new Error();
    const record = result as Record<string, unknown>;
    if (typeof record['unavailable'] === 'string') {
      const permitted = ['bundled syntax parser is unavailable',
        'source could not be parsed within the supported limits'];
      return unavailableSyntax(permitted.includes(record['unavailable'])
        ? record['unavailable'] : 'parser returned an invalid result', path);
    }
    const lines = record['lines'];
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
