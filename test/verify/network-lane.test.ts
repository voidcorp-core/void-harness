import { describe, expect, it } from 'vitest';
import { runNetworkLane } from '../../scripts/test-network.mjs';

describe('network lane admission', () => {
  it('refuses unavailable loopback before admitting tests', () => {
    const commands: string[][] = [];
    const result = runNetworkLane((_command: string, args: string[]) => {
      commands.push(args);
      return { status: 1, stderr: 'EPERM', stdout: '' };
    });
    expect(result).toEqual({ status: 'unknown', exitCode: 2, reason: 'loopback unavailable: EPERM' });
    expect(commands).toHaveLength(1);
  });

  it('keeps a failed test red without retry after a healthy probe', () => {
    let invocations = 0;
    const result = runNetworkLane(() => ({ status: ++invocations === 1 ? 0 : 1 }));
    expect(result).toEqual({ status: 'failed', exitCode: 1 });
    expect(invocations).toBe(2);
  });

  it('bounds both processes and admits only the network projects', () => {
    const calls: { args: string[]; options: { timeout: number; shell: boolean } }[] = [];
    const result = runNetworkLane((_command: string, args: string[], options: { timeout: number; shell: boolean }) => {
      calls.push({ args, options });
      return { status: 0 };
    });
    expect(result).toEqual({ status: 'passed', exitCode: 0 });
    expect(calls.map(({ options }) => options.timeout)).toEqual([2_000, 120_000]);
    expect(calls.every(({ options }) => options.shell === false)).toBe(true);
    expect(calls[1]?.args).toContain('--project=*:network-browser');
    expect(calls[1]?.args).toContain('--pool=threads');
  });

  it('reports a killed lane as unknown rather than successful', () => {
    let invocations = 0;
    const result = runNetworkLane(() => ++invocations === 1
      ? { status: 0 }
      : { error: Object.assign(new Error('expired'), { code: 'ETIMEDOUT' }) });
    expect(result).toEqual({ status: 'unknown', exitCode: 2, reason: 'network test process unavailable: ETIMEDOUT' });
    expect(invocations).toBe(2);
  });
});
