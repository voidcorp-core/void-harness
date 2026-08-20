import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

export type TypecheckConfig =
  | { readonly argv: readonly string[] }
  | { readonly warning: string }
  | { readonly argv?: never; readonly warning?: never };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}



/**
 * Ambient variables a package runner needs to start, and nothing beyond them.
 *
 * The configured command runs at the Stop hook without anyone asking for it. It
 * inherited `process.env` in full, so it also inherited every credential the
 * session held. A type checker needs a PATH, a home, a temp directory and a
 * locale; it has no use for a cloud token.
 *
 * An allow-list rather than a deny-list: a deny-list is a guess about the names
 * secrets will have next year.
 */
const AMBIENT_KEPT = new Set([
  'PATH', 'Path', 'PATHEXT',
  'HOME', 'USERPROFILE',
  'SystemRoot', 'windir', 'COMSPEC',
  'TMPDIR', 'TEMP', 'TMP',
  'LANG', 'LC_ALL', 'TZ',
  'SHELL', 'USER', 'LOGNAME',
]);

/** The environment the configured command may see. Pure. */
export function minimalEnvironment(
  ambient: Readonly<Record<string, string | undefined>>,
  passed: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(ambient)) {
    if (value !== undefined && AMBIENT_KEPT.has(name)) kept[name] = value;
  }
  // What the harness hands down deliberately is not ambient state.
  for (const [name, value] of Object.entries(passed)) {
    if (value !== undefined) kept[name] = value;
  }
  return kept;
}

// What `.void/config.json` is allowed to name at the Stop hook.
//
// That file is `project` state: versioned, and therefore supplied by whatever
// checkout is open. Before this list, anything went -- the only validation was
// that the array held strings, so `["bash","-c",…]` was accepted and ran with the
// caller's full environment, unprompted. `shell: false` never protected against
// that: a shell passed as argv[0] is not an injection, it is the command.
//
// Dropping the setting instead was measured and rejected: all four consumer
// projects configure it, every one of them with the same shape (`pnpm exec tsc
// --noEmit`, `bunx tsc --noEmit`). So the shape is what gets recognised.

/** Package runners that only forward to a binary, and cannot reach a repo script. */
const LAUNCHERS: Readonly<Record<string, readonly string[]>> = {
  pnpm: ['exec', 'dlx'],
  npm: ['exec'],
  yarn: ['exec', 'dlx'],
  bun: ['x'],
  // Runners that take the binary directly, with no subcommand.
  npx: [],
  bunx: [],
  pnpx: [],
};

/**
 * Type checkers, and nothing else. `pnpm run <script>` is deliberately absent:
 * the script body lives in the repository's own package.json, so allowing it
 * would hand back exactly the freedom this list removes.
 */
const CHECKERS = new Set(['tsc', 'vue-tsc', 'svelte-check', 'astro', 'tsgo']);

/** A flag, or the value of one. Never a chained command or a stray word. */
function argumentIsSafe(argument: string): boolean {
  if (argument.startsWith('-')) return /^-{1,2}[A-Za-z][\w-]*$/.test(argument);
  return /^[\w./-]+$/.test(argument) && !argument.startsWith('/') && !argument.includes('..');
}

/**
 * The argv this repository may run, or `undefined` with the reason.
 *
 * Exported for its own tests: this is the whole security boundary of the Stop
 * hook, and it is worth reading on its own.
 */
export function acceptableTypecheck(argv: readonly string[]): string | undefined {
  const [head, ...rest] = argv;
  if (head === undefined) return 'empty command';
  if (head.includes('/') || head.includes('\\')) return `path-qualified executable ${head}`;

  let checkerIndex = 0;
  if (Object.hasOwn(LAUNCHERS, head)) {
    const subcommands = LAUNCHERS[head] ?? [];
    if (subcommands.length > 0) {
      const subcommand = rest[0];
      if (subcommand === undefined || !subcommands.includes(subcommand)) {
        return `${head} must be followed by ${subcommands.join(' or ')}, not ${String(subcommand)}`;
      }
      checkerIndex = 1;
    }
  } else if (CHECKERS.has(head)) {
    return rest.every(argumentIsSafe) ? undefined : 'argument that is not a flag or a path';
  } else {
    return `unknown executable ${head}`;
  }

  const checker = rest[checkerIndex];
  if (checker === undefined || !CHECKERS.has(checker)) return `unknown type checker ${String(checker)}`;
  return rest.slice(checkerIndex + 1).every(argumentIsSafe)
    ? undefined
    : 'argument that is not a flag or a path';
}

export function configuredTypecheck(value: unknown): TypecheckConfig {
  const root = record(value);
  const commands = record(root?.['commands']);
  const configured = commands?.['typecheck'];
  if (
    Array.isArray(configured)
    && configured.length > 0
    && configured.every((argument) => typeof argument === 'string')
  ) {
    const refusal = acceptableTypecheck(configured);
    return refusal === undefined
      ? { argv: configured }
      : { warning: `commands.typecheck refused (${refusal}); falling back to the resolved type checker` };
  }
  if (typeof configured === 'string') {
    return {
      warning: 'legacy commands.typecheck string ignored; migrate it to argv',
    };
  }
  return {};
}

function within(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function nearestTsconfigs(
  changedPaths: readonly string[],
  projectRoot: string,
  hasFile: (path: string) => boolean,
): string[] {
  const root = resolve(projectRoot);
  const found = new Set<string>();
  for (const changedPath of changedPaths) {
    if (!/\.(?:ts|tsx)$/.test(changedPath) || changedPath.endsWith('.d.ts')) continue;
    const target = resolve(root, changedPath);
    if (!within(root, target)) continue;
    let current = dirname(target);
    while (within(root, current)) {
      const config = join(current, 'tsconfig.json');
      if (hasFile(config)) {
        found.add(config);
        break;
      }
      if (current === root) break;
      current = dirname(current);
    }
  }
  return [...found];
}
