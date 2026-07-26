import { existsSync } from 'node:fs';
import { dirname, win32 } from 'node:path';

const MAX_PATH_ENTRIES = 128;

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
