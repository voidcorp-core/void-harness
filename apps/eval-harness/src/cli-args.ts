export type EvalRuntime = 'claude' | 'codex';

export interface EvalArgs {
  readonly caseKey: string | undefined;
  readonly suite: string | undefined;
  readonly runtimes: readonly EvalRuntime[];
  readonly runs: number;
  readonly threshold: number;
  readonly sensitivity: boolean;
  readonly headToHead: string | undefined;
}

function flagValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index < 0 ? undefined : argv[index + 1];
}

function numberFlag(
  argv: readonly string[],
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  integer: boolean,
): number {
  const value = flagValue(argv, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed)
    || parsed < minimum
    || parsed > maximum
    || (integer && !Number.isInteger(parsed))
  ) {
    const expected = integer ? 'an integer' : 'a number';
    throw new Error(`--${name} must be ${expected} in [${minimum}, ${maximum}] (got ${value})`);
  }
  return parsed;
}

function runtimes(value: string | undefined): readonly EvalRuntime[] {
  if (value === undefined || value === 'claude') return ['claude'];
  if (value === 'codex') return ['codex'];
  if (value === 'both' || value === 'claude,codex' || value === 'codex,claude') {
    return ['claude', 'codex'];
  }
  throw new Error('--runtime must be claude, codex, or both');
}

export function parseEvalArgs(rawArgv: readonly string[]): EvalArgs {
  const argv = rawArgv.filter((value) => value !== '--');
  const skill = argv[0]?.startsWith('--') === false ? argv[0] : undefined;
  const suite = flagValue(argv, 'suite');
  if (skill !== undefined && suite !== undefined) {
    throw new Error('choose a skill or --suite, not both');
  }
  return {
    caseKey: suite ?? skill,
    suite,
    runtimes: runtimes(flagValue(argv, 'runtime')),
    runs: numberFlag(argv, 'runs', 3, 1, 20, true),
    threshold: numberFlag(argv, 'threshold', 0.15, 0, 1, false),
    sensitivity: argv.includes('--sensitivity'),
    headToHead: flagValue(argv, 'head-to-head'),
  };
}
