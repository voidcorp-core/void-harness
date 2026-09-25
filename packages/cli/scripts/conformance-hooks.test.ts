import { describe, expect, it } from 'vitest';
import {
  assertCanonicalHookReplay,
  codexHookLaunchers,
  runtimesForMode,
} from './conformance-hooks-lib.mjs';

function event(
  seq: number,
  runtime: 'claude' | 'codex',
  kind: 'runtime.tool.started' | 'hook.completed',
): string {
  return JSON.stringify({
    schemaVersion: 1,
    seq,
    eventId: `evt_${runtime}_${seq}`,
    missionId: 'mis_conformance_both',
    ts: '2026-07-24T00:00:00.000Z',
    source: `runtime:${runtime}`,
    kind,
    subject: kind === 'hook.completed' ? 'hook:no-console' : 'tool:Write',
    correlationId: 'mis_conformance_both',
    payload: {},
  });
}

describe('hook conformance replay', () => {
  it('maps install modes to the runtimes that must actually fire', () => {
    expect(runtimesForMode('claude')).toEqual(['claude']);
    expect(runtimesForMode('codex')).toEqual(['codex']);
    expect(runtimesForMode('both')).toEqual(['claude', 'codex']);
  });

  it('accepts a contiguous canonical stream with runtime and hook proof', () => {
    const body = [
      event(1, 'claude', 'runtime.tool.started'),
      event(2, 'codex', 'runtime.tool.started'),
      event(3, 'claude', 'hook.completed'),
      event(4, 'codex', 'hook.completed'),
      '',
    ].join('\n');

    expect(() =>
      assertCanonicalHookReplay(body, {
        missionId: 'mis_conformance_both',
        runtimes: ['claude', 'codex'],
      }),
    ).not.toThrow();
  });

  it.each([
    {
      name: 'malformed JSON',
      body: '{bad json}\n',
      issue: 'invalid JSON',
      runtimes: ['claude', 'codex'] as const,
    },
    {
      name: 'a sequence gap',
      body: [
        event(1, 'claude', 'runtime.tool.started'),
        event(3, 'claude', 'hook.completed'),
      ].join('\n'),
      issue: 'expected seq 2',
      runtimes: ['claude'] as const,
    },
    {
      name: 'a missing runtime proof',
      body: [
        event(1, 'claude', 'runtime.tool.started'),
        event(2, 'claude', 'hook.completed'),
      ].join('\n'),
      issue: 'runtime:codex',
      runtimes: ['claude', 'codex'] as const,
    },
    {
      name: 'a missing enforcement proof',
      body: event(1, 'claude', 'runtime.tool.started'),
      issue: 'hook.completed',
      runtimes: ['claude'] as const,
    },
  ])('rejects $name', ({ body, issue, runtimes }) => {
    expect(() =>
      assertCanonicalHookReplay(body, {
        missionId: 'mis_conformance_both',
        runtimes,
      }),
    ).toThrow(issue);
  });
});

// Mirrors codex-rs/hooks/src/engine/command_runner.rs (build_command) and
// codex-rs/core/src/shell.rs (derive_exec_args): the session shell with -c or
// -NoProfile -Command, else $SHELL -lc or %COMSPEC% /C with the raw quoted line.
describe('Codex hook launchers', () => {
  const line = 'node -e "x" enforce dangerous-command codex';

  it('runs POSIX hooks through sh and bash, as the session shell or the login fallback', () => {
    expect(codexHookLaunchers('linux', line, {})).toEqual([
      { shell: 'sh', command: '/bin/sh', args: ['-c', line], verbatim: false },
      { shell: 'sh login', command: '/bin/sh', args: ['-lc', line], verbatim: false },
      { shell: 'bash', command: 'bash', args: ['-c', line], verbatim: false },
    ]);
  });

  it('adds zsh, the macOS default session shell', () => {
    expect(codexHookLaunchers('darwin', line, {}).map((launcher) => launcher.shell)).toEqual([
      'sh',
      'sh login',
      'bash',
      'zsh',
    ]);
  });

  it('runs Windows hooks through raw-quoted cmd.exe and through both PowerShells', () => {
    const env = { ComSpec: 'C:\\Windows\\system32\\cmd.exe' };
    expect(codexHookLaunchers('win32', line, env)).toEqual([
      {
        shell: 'cmd',
        command: 'C:\\Windows\\system32\\cmd.exe',
        args: ['/C', `"${line}"`],
        verbatim: true,
      },
      {
        shell: 'powershell',
        command: 'powershell.exe',
        args: ['-NoProfile', '-Command', line],
        verbatim: false,
      },
      { shell: 'pwsh', command: 'pwsh', args: ['-NoProfile', '-Command', line], verbatim: false },
    ]);
  });

  it('falls back to cmd.exe when ComSpec is unset', () => {
    expect(codexHookLaunchers('win32', line, {})[0]?.command).toBe('cmd.exe');
  });
});
