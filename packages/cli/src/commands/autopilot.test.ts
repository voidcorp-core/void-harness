import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runAutopilotCommand } from './autopilot.js';

function observation(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    tickets: [
      {
        id: 'DEV-1',
        ready: true,
        priority: 2,
        boardOrder: 0,
        blockedByOpen: false,
        dependsOn: [],
        estimate: 5,
      },
      {
        id: 'DEV-2',
        ready: true,
        priority: 3,
        boardOrder: 1,
        blockedByOpen: true,
        dependsOn: [],
        estimate: 3,
      },
    ],
    footprints: [
      { id: 'DEV-1', areas: ['packages/cli'], highRisk: false, confidence: 0.9 },
      { id: 'DEV-2', areas: ['packages/core'], highRisk: false, confidence: 0.9 },
    ],
    ...over,
  });
}

describe('runAutopilotCommand', () => {
  it('prints the machine contract under --json', () => {
    const result = runAutopilotCommand(['plan', '--json'], observation());

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const plan = JSON.parse(result.stdout);
    expect(plan.schemaVersion).toBe(1);
    expect(plan.cluster).toEqual(['DEV-1']);
    expect(plan.excluded).toEqual([{ id: 'DEV-2', cause: 'blocked-by-open' }]);
  });

  it('renders a human view by default because an operator reads this before confirming', () => {
    const result = runAutopilotCommand(['plan'], observation());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('DEV-1');
    expect(result.stdout).toContain('DEV-2');
    expect(result.stdout).toContain('blocked-by-open');
    expect(() => JSON.parse(result.stdout)).toThrow();
  });

  it('reports the review budget so a shrunk cluster is never silent', () => {
    const result = runAutopilotCommand(['plan'], observation());

    expect(result.stdout).toMatch(/review budget/i);
  });

  it('fails closed on stdin that is not JSON', () => {
    const result = runAutopilotCommand(['plan'], 'not json');

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('AUTOPILOT_INPUT');
    expect(result.stderr).toMatch(/Cause:/);
    expect(result.stderr).toMatch(/Fix:/);
  });

  it('keeps the failure structured under --json because the caller is an agent', () => {
    const result = runAutopilotCommand(['plan', '--json'], 'not json');

    expect(result.exitCode).toBe(2);
    const { error } = JSON.parse(result.stderr);
    expect(error.code).toBe('AUTOPILOT_INPUT');
    expect(error.cause).toBeTruthy();
    expect(error.fix).toBeTruthy();
  });

  it('fails closed on an observation whose schema version is unknown', () => {
    const result = runAutopilotCommand(['plan'], observation({ schemaVersion: 2 }));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/schemaVersion/);
    expect(result.stderr).toMatch(/Fix:/);
  });

  it('fails closed on a cluster size the contract does not allow', () => {
    const result = runAutopilotCommand(['plan'], observation({ clusterSize: 9 }));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/clusterSize/);
  });

  it('refuses --auto-merge because merging stays a human gate', () => {
    const result = runAutopilotCommand(['plan', '--auto-merge'], observation());

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--auto-merge');
    expect(result.stderr).toMatch(/human/i);
  });

  it('refuses an unknown subcommand', () => {
    const result = runAutopilotCommand(['teleport'], '');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('teleport');
  });

  it('refuses an empty invocation instead of guessing a subcommand', () => {
    const result = runAutopilotCommand([], '');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/Fix:/);
  });

  it('prints usage on --help', () => {
    const result = runAutopilotCommand(['--help'], '');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('autopilot plan');
    expect(result.stderr).toBe('');
  });
});

describe('cutover safety', () => {
  const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

  it('keeps backlog-autopilot as the public surface until the cutover range', () => {
    // Range A builds the destination; it does not move anyone onto it. Wiring
    // this command into main.ts early would publish two engines in one release.
    expect(mainSource).toContain("case 'backlog-autopilot':");
    expect(mainSource).not.toContain("case 'autopilot':");
    expect(mainSource).not.toContain("from './commands/autopilot.js'");
  });
});
