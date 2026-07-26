import { describe, expect, it } from 'vitest';
import { packageManagerCommand } from './conformance-process.mjs';

describe('packageManagerCommand', () => {
  it('runs pnpm through its JavaScript entrypoint on Windows', () => {
    const command = packageManagerCommand('pnpm', {
      platform: 'win32',
      nodeExecutable: 'C:\\node\\node.exe',
      environment: {
        npm_execpath: 'C:\\pnpm\\pnpm.cjs',
      },
      isFile: (candidate) => candidate === 'C:\\pnpm\\pnpm.cjs',
    });

    expect(command).toEqual({
      executable: 'C:\\node\\node.exe',
      prefixArguments: ['C:\\pnpm\\pnpm.cjs'],
    });
  });

  it('runs the npm JavaScript CLI shipped beside Node on Windows', () => {
    const npmCli = 'C:\\node\\node_modules\\npm\\bin\\npm-cli.js';
    const command = packageManagerCommand('npm', {
      platform: 'win32',
      nodeExecutable: 'C:\\node\\node.exe',
      environment: { PATH: 'C:\\node;C:\\Windows' },
      isFile: (candidate) => candidate === npmCli,
    });

    expect(command).toEqual({
      executable: 'C:\\node\\node.exe',
      prefixArguments: [npmCli],
    });
  });

  it('fails with an actionable error instead of spawning a cmd shim', () => {
    expect(() => packageManagerCommand('pnpm', {
      platform: 'win32',
      nodeExecutable: 'C:\\node\\node.exe',
      environment: {},
      isFile: () => false,
    })).toThrow('cannot resolve pnpm JavaScript entrypoint');
  });

  it('uses native executables on POSIX', () => {
    expect(packageManagerCommand('npm', {
      platform: 'linux',
      nodeExecutable: '/usr/bin/node',
      environment: {},
      isFile: () => false,
    })).toEqual({ executable: 'npm', prefixArguments: [] });
  });
});
