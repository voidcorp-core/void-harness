import { spawn } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute, win32 } from 'node:path';

const MAX_PATH_ENTRIES = 128;
const DEFAULT_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
export const CONFORMANCE_PACK_TIMEOUT_MS = 5 * 60_000;
const TERMINATION_TIMEOUT_MS = 5_000;
const CREDENTIAL_KEY = '(?:api[-_]?key|authorization|password|secret|auth[-_]?token|token)';
const CREDENTIAL_ASSIGNMENT = new RegExp(
  `((?:^|[\\s"'/:])(?:[A-Za-z0-9]+_)*_?${CREDENTIAL_KEY}\\s*[:=]\\s*)[^\\s&,;]+`,
  'gim',
);
const PORTABLE_ENVIRONMENT = [
  'APPDATA',
  'CI',
  'ComSpec',
  'LANG',
  'LC_ALL',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'npm_execpath',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'WINDIR',
];

export function conformanceEnvironment(extra = {}, source = process.env) {
  const inherited = PORTABLE_ENVIRONMENT
    .map((name) => [name, source[name]])
    .filter((entry) => entry[1] !== undefined);
  return Object.fromEntries([...inherited, ...Object.entries(extra)]);
}

function boundedUtf8(value, maxBytes) {
  const bytes = Buffer.from(value);
  if (bytes.byteLength <= maxBytes) return value;
  return bytes.subarray(0, maxBytes).toString('utf8');
}

export function safeConformanceDiagnostic(value, maxBytes = DEFAULT_OUTPUT_BYTES) {
  const redacted = value
    .replace(/(\bBearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(CREDENTIAL_ASSIGNMENT, '$1[REDACTED]');
  return boundedUtf8(redacted, maxBytes);
}

export function resolveConformanceTarball(environment = process.env) {
  const candidate = environment.VOID_CONFORMANCE_TARBALL;
  if (candidate === undefined) return undefined;
  try {
    const metadata = lstatSync(candidate);
    if (
      !isAbsolute(candidate)
      || !candidate.endsWith('.tgz')
      || !metadata.isFile()
      || metadata.isSymbolicLink()
      || metadata.size === 0
    ) {
      throw new Error('invalid');
    }
  } catch {
    throw new Error('conformance tarball must be an existing absolute regular .tgz file');
  }
  return candidate;
}

export function preserveConformanceFixtures(environment = process.env) {
  return environment.VOID_CONFORMANCE_PRESERVE_FIXTURES === '1';
}

export function resolveConformanceFixtureRoot(environment = process.env) {
  const candidate = environment.VOID_CONFORMANCE_FIXTURE_ROOT;
  if (candidate === undefined) return undefined;
  try {
    const metadata = lstatSync(candidate);
    if (!isAbsolute(candidate) || !metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('invalid');
    }
  } catch {
    throw new Error('conformance fixture root must be an existing absolute regular directory');
  }
  return candidate;
}

function boundedStream(maxBytes) {
  const chunks = [];
  let bytes = 0;
  return {
    append(chunk) {
      const remaining = Math.max(0, maxBytes - bytes);
      if (remaining > 0) {
        const captured = chunk.subarray(0, remaining);
        chunks.push(captured);
        bytes += captured.byteLength;
      }
      return chunk.byteLength > remaining;
    },
    value() {
      return Buffer.concat(chunks).toString('utf8');
    },
  };
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolveExit) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveExit();
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once('error', finish);
    child.once('close', finish);
  });
}

async function terminateProcessTree(child, platform, environment) {
  if (child.pid === undefined) return;
  if (platform === 'win32') {
    const windowsRoot = environment.SystemRoot ?? environment.WINDIR;
    const taskkillExecutable = windowsRoot === undefined
      ? 'taskkill.exe'
      : win32.join(windowsRoot, 'System32', 'taskkill.exe');
    const taskkill = spawn(
      taskkillExecutable,
      ['/pid', String(child.pid), '/t', '/f'],
      { env: environment, shell: false, stdio: 'ignore' },
    );
    await waitForExit(taskkill, TERMINATION_TIMEOUT_MS);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

export function runConformanceProcess(options) {
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const environment = conformanceEnvironment(options.environment);
  return new Promise((resolveRun) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      detached: process.platform !== 'win32',
      env: environment,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = boundedStream(maxOutputBytes);
    const stderr = boundedStream(maxOutputBytes);
    let outputExceeded = false;
    let timedOut = false;
    let spawnError;
    let termination;

    const terminate = () => {
      termination ??= terminateProcessTree(child, process.platform, environment);
      return termination;
    };
    const capture = (target) => (chunk) => {
      if (target.append(chunk)) {
        outputExceeded = true;
        void terminate();
      }
    };
    child.stdout.on('data', capture(stdout));
    child.stderr.on('data', capture(stderr));
    child.once('error', (error) => {
      spawnError = error;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      void terminate();
    }, timeoutMs);
    child.once('close', async (code, signal) => {
      clearTimeout(timer);
      if (termination !== undefined) await termination;
      const outcome = spawnError !== undefined
        ? { kind: 'spawn-error' }
        : outputExceeded
          ? { kind: 'output-exceeded' }
          : timedOut
            ? { kind: 'timed-out' }
            : code !== null
              ? { kind: 'exited', code }
              : { kind: 'signaled', signal: signal ?? 'unknown' };
      resolveRun({
        outcome,
        outputExceeded,
        stdout: stdout.value(),
        stderr: stderr.value(),
      });
    });
    child.stdin.on('error', () => {
      // The discriminated process outcome remains authoritative.
    });
    child.stdin.end(options.input ?? '');
  });
}

function windowsNpmCli(options) {
  const pathValue = options.environment.PATH
    ?? options.environment.Path
    ?? '';
  const directories = [
    dirname(options.nodeExecutable),
    ...pathValue.split(win32.delimiter),
  ].filter((entry) => entry !== '').slice(0, MAX_PATH_ENTRIES);
  for (const directory of new Set(directories)) {
    const candidate = win32.join(
      directory,
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    );
    if (options.isFile(candidate)) return candidate;
  }
  return undefined;
}

function windowsCli(manager, options) {
  if (manager === 'pnpm') {
    const candidate = options.environment.npm_execpath;
    if (
      typeof candidate === 'string'
      && /\.(?:cjs|mjs|js)$/i.test(candidate)
      && options.isFile(candidate)
    ) {
      return candidate;
    }
  } else {
    const candidate = windowsNpmCli(options);
    if (candidate !== undefined) return candidate;
  }
  throw new Error(
    `conformance cannot resolve ${manager} JavaScript entrypoint on Windows`,
  );
}

export function packageManagerCommand(manager, overrides = {}) {
  if (manager !== 'npm' && manager !== 'pnpm') {
    throw new Error(`conformance unsupported package manager: ${String(manager)}`);
  }
  const options = {
    platform: overrides.platform ?? process.platform,
    nodeExecutable: overrides.nodeExecutable ?? process.execPath,
    environment: overrides.environment ?? process.env,
    isFile: overrides.isFile ?? existsSync,
  };
  if (options.platform !== 'win32') {
    return { executable: manager, prefixArguments: [] };
  }
  return {
    executable: options.nodeExecutable,
    prefixArguments: [windowsCli(manager, options)],
  };
}
