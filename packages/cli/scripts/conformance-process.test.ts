// @test-resource subprocess
import { describe, expect, it } from 'vitest';
import {
  conformanceEnvironment,
  packageManagerCommand,
  runConformanceProcess,
  safeConformanceDiagnostic,
} from './conformance-process.mjs';

describe('contained conformance process', () => {
  it('inherits only execution essentials and explicit fixture-local state', () => {
    expect(
      conformanceEnvironment(
        { HOME: '/fixture/home', TMPDIR: '/fixture/tmp' },
        {
          CI: '1',
          HOME: '/Users/private',
          OPENAI_API_KEY: 'must-not-cross',
          PATH: '/usr/bin',
        },
      ),
    ).toEqual({
      CI: '1',
      PATH: '/usr/bin',
      HOME: '/fixture/home',
      TMPDIR: '/fixture/tmp',
    });
  });

  it('returns an explicit outcome when output exceeds its byte budget', async () => {
    const result = await runConformanceProcess({
      command: process.execPath,
      args: ['-e', "process.stdout.write('x'.repeat(256))"],
      cwd: process.cwd(),
      maxOutputBytes: 32,
    });

    expect(result.outcome.kind).toBe('output-exceeded');
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(32);
  });

  it('returns timed-out after terminating a process that does not exit', async () => {
    const result = await runConformanceProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      timeoutMs: 50,
    });

    expect(result.outcome.kind).toBe('timed-out');
  });

  it('redacts provider-prefixed credentials before bounding diagnostics', () => {
    expect(
      safeConformanceDiagnostic(
        'NPM_TOKEN=top-secret Authorization: bearer-secret Bearer session-secret',
      ),
    ).toBe('NPM_TOKEN=[REDACTED] Authorization: [REDACTED] Bearer [REDACTED]');
  });
});

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
