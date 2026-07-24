import { isHarnessSourceRepo } from '../lib/self-repo.js';
import {
  syncSelfHost,
} from '../lib/self-host/compile.js';
import {
  diagnoseSelfHost,
  type SelfHostDiagnosis,
  type SelfHostState,
} from '../lib/self-host/doctor.js';
import {
  isSelfHostMode,
  type SelfHostMode,
} from '../lib/self-host/receipt.js';
import { banner, blank, c, footer, glyph, line, meta } from '../lib/render.js';

type SelfHostArgs =
  | { readonly action: 'sync'; readonly mode: SelfHostMode }
  | { readonly action: 'doctor'; readonly mode?: SelfHostMode };

function modeAfter(args: readonly string[]): SelfHostMode | undefined {
  const index = args.indexOf('--mode');
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!isSelfHostMode(value)) {
    throw new Error('invalid --mode; use shadow, warn, enforce, or release-gate');
  }
  return value;
}

export function parseSelfHostArgs(args: readonly string[]): SelfHostArgs {
  const action = args[0];
  if (action !== 'sync' && action !== 'doctor') {
    throw new Error('self-host expects sync or doctor');
  }
  if (
    args.length !== 1
    && !(args.length === 3 && args[1] === '--mode')
  ) {
    throw new Error('self-host accepts only --mode <rollout-mode>');
  }
  const mode = modeAfter(args);
  if (action === 'sync') return { action, mode: mode ?? 'shadow' };
  return mode === undefined ? { action } : { action, mode };
}

export function selfHostExitCode(
  state: SelfHostState,
  mode: SelfHostMode,
): number {
  if (mode !== 'enforce' && mode !== 'release-gate') return 0;
  return state === 'not-installed' || state === 'stale' || state === 'drifted'
    ? 2
    : 0;
}

function renderDiagnosis(diagnosis: SelfHostDiagnosis): void {
  banner('self-host doctor');
  meta('mode', diagnosis.mode);
  meta('artifact', diagnosis.artifactRoot);
  blank();
  for (const check of diagnosis.checks) {
    const mark = check.status === 'ok'
      ? c.green(glyph.check)
      : check.status === 'degraded'
        ? c.yellow('?')
        : c.red('x');
    line(`${mark}  ${c.dim(check.id.padEnd(18))}${check.detail}`);
  }
  const renderedState = diagnosis.state === 'healthy'
    ? c.green(diagnosis.state)
    : diagnosis.blocking
      ? c.red(diagnosis.state)
      : c.yellow(diagnosis.state);
  footer(`self-host ${renderedState}`);
}

export async function runSelfHostDoctor(
  root: string,
  args: readonly string[] = [],
): Promise<SelfHostDiagnosis> {
  const mode = modeAfter(args);
  const diagnosis = await diagnoseSelfHost(root, {
    ...(mode === undefined ? {} : { mode }),
  });
  renderDiagnosis(diagnosis);
  process.exitCode = selfHostExitCode(diagnosis.state, diagnosis.mode);
  return diagnosis;
}

export async function selfHost(args: readonly string[]): Promise<void> {
  const root = process.cwd();
  if (!isHarnessSourceRepo(root)) {
    process.stderr.write('self-host is only available inside the void-harness source repository\n');
    process.exitCode = 2;
    return;
  }
  let parsed: SelfHostArgs;
  try {
    parsed = parseSelfHostArgs(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid self-host arguments';
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
    return;
  }
  if (parsed.action === 'doctor') {
    await runSelfHostDoctor(
      root,
      parsed.mode === undefined ? [] : ['--mode', parsed.mode],
    );
    return;
  }
  banner('self-host sync');
  meta('mode', parsed.mode);
  const result = await syncSelfHost(root, { mode: parsed.mode });
  meta('source', result.sourceHash.slice(0, 12));
  meta('artifact', result.artifactRoot);
  line(
    result.changed
      ? `${c.green(glyph.check)}  compiled and atomically published ${result.files} owned files`
      : `${c.green(glyph.check)}  current artifact already matches ${result.files} owned files`,
  );
  footer(result.changed ? 'self-host synchronized' : 'self-host unchanged');
}
