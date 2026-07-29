import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseActiveProgram, readActiveProgram } from './active-program.js';

const VALID = `---
status: executing
program: void-harness-v3
plan: plans/2026-07-24-plan.md
spec: docs/specs/2026-07-24-spec.md
tracker:
  provider: linear
  scope: voidcorp/DEV/void harness
  issues: [DEV-433, DEV-434]
  readyStates: [Backlog, Todo]
  startedState: In Progress
  reviewState: In Review
  doneStates: [Done]
humanGates:
  - DEV-433
autopilot:
  schemaVersion: 1
  enabled: true
  clusterSize: 4
  base: auto
  mergeGate: human
  verifyCommands:
    - [pnpm, build]
    - [pnpm, test]
  ownership:
    sequential:
      - pnpm-lock.yaml
    reconcileOnly: []
---

# Active program
`;

function withAutopilot(block: string): string {
  return VALID.replace(/autopilot:\n(?:.*\n)*?---/, `${block}\n---`);
}

describe('parseActiveProgram', () => {
  it('reads a valid Linear-backed active program', () => {
    const program = parseActiveProgram(VALID);

    expect(program.status).toBe('executing');
    expect(program.program).toBe('void-harness-v3');
    expect(program.tracker.provider).toBe('linear');
    expect(program.tracker.scope).toBe('voidcorp/DEV/void harness');
    expect(program.tracker.issues).toEqual(['DEV-433', 'DEV-434']);
    expect(program.tracker.readyStates).toEqual(['Backlog', 'Todo']);
    expect(program.tracker.startedState).toBe('In Progress');
    expect(program.tracker.reviewState).toBe('In Review');
    expect(program.tracker.doneStates).toEqual(['Done']);
    expect(program.humanGates).toEqual(['DEV-433']);
    expect(program.autopilot.enabled).toBe(true);
    expect(program.autopilot.clusterSize).toBe(4);
    expect(program.autopilot.verifyCommands).toEqual([
      ['pnpm', 'build'],
      ['pnpm', 'test'],
    ]);
    expect(program.autopilot.ownership.sequential).toEqual(['pnpm-lock.yaml']);
  });

  it('accepts a disabled autopilot because consent must be expressible as no', () => {
    const program = parseActiveProgram(
      withAutopilot('autopilot:\n  schemaVersion: 1\n  enabled: false\n  mergeGate: human'),
    );

    expect(program.autopilot.enabled).toBe(false);
    // Defaults still resolve, so a later `enabled: true` needs no other edit.
    expect(program.autopilot.clusterSize).toBe(4);
  });

  it('rejects a file with no frontmatter', () => {
    expect(() => parseActiveProgram('# just a heading\n')).toThrow(/frontmatter/i);
  });

  it('rejects invalid YAML with an actionable message', () => {
    expect(() => parseActiveProgram('---\nstatus: [unclosed\n---\n')).toThrow(/YAML/i);
  });

  it('rejects a missing autopilot block because the contract is not optional', () => {
    const withoutBlock = VALID.replace(/autopilot:\n(?:.*\n)*?---/, '---');
    expect(() => parseActiveProgram(withoutBlock)).toThrow(/autopilot/);
  });

  it('rejects a missing autopilot schema version rather than assuming version 1', () => {
    expect(() => parseActiveProgram(withAutopilot('autopilot:\n  enabled: true\n  mergeGate: human'))).toThrow(
      /schemaVersion/,
    );
  });

  it('rejects an unknown autopilot schema version with a migration instruction', () => {
    let thrown: unknown;
    try {
      parseActiveProgram(withAutopilot('autopilot:\n  schemaVersion: 2\n  enabled: true\n  mergeGate: human'));
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toMatch(/schemaVersion/);
    expect((thrown as { failure: { fix: string } }).failure.fix).toMatch(/1/);
  });

  it('rejects a merge gate that is not human because merging is the human boundary', () => {
    expect(() =>
      parseActiveProgram(withAutopilot('autopilot:\n  schemaVersion: 1\n  enabled: true\n  mergeGate: auto')),
    ).toThrow(/mergeGate/);
  });

  it('rejects a cluster size outside 1..4', () => {
    const tooBig = 'autopilot:\n  schemaVersion: 1\n  enabled: true\n  mergeGate: human\n  clusterSize: 5';
    const tooSmall = 'autopilot:\n  schemaVersion: 1\n  enabled: true\n  mergeGate: human\n  clusterSize: 0';
    expect(() => parseActiveProgram(withAutopilot(tooBig))).toThrow(/clusterSize/);
    expect(() => parseActiveProgram(withAutopilot(tooSmall))).toThrow(/clusterSize/);
  });

  it('rejects a verify command that is not an argv array because shell:false is the contract', () => {
    const shellish =
      'autopilot:\n  schemaVersion: 1\n  enabled: true\n  mergeGate: human\n  verifyCommands:\n    - pnpm test';
    expect(() => parseActiveProgram(withAutopilot(shellish))).toThrow(/verifyCommands/);
  });

  it('rejects an empty verify command', () => {
    const empty =
      'autopilot:\n  schemaVersion: 1\n  enabled: true\n  mergeGate: human\n  verifyCommands:\n    - []';
    expect(() => parseActiveProgram(withAutopilot(empty))).toThrow(/verifyCommands/);
  });

  it('rejects an absolute or escaping plan path because the program stays inside the repo', () => {
    expect(() => parseActiveProgram(VALID.replace('plans/2026-07-24-plan.md', '/etc/passwd'))).toThrow(/plan/);
    expect(() => parseActiveProgram(VALID.replace('plans/2026-07-24-plan.md', '../outside/plan.md'))).toThrow(
      /plan/,
    );
  });

  it('rejects an escaping ownership path', () => {
    const escaping =
      'autopilot:\n  schemaVersion: 1\n  enabled: true\n  mergeGate: human\n  ownership:\n    sequential:\n      - ../../etc/hosts';
    expect(() => parseActiveProgram(withAutopilot(escaping))).toThrow(/ownership/);
  });

  it('rejects an unsupported tracker provider without pretending it will keep working', () => {
    let thrown: unknown;
    try {
      parseActiveProgram(VALID.replace('provider: linear', 'provider: jira'));
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toMatch(/provider/);
    expect((thrown as { failure: { cause: string } }).failure.cause).toMatch(/jira/);
  });

  it('rejects a missing tracker scope field', () => {
    expect(() => parseActiveProgram(VALID.replace('  startedState: In Progress\n', ''))).toThrow(/startedState/);
  });

  it('rejects an empty issue order because a tie-break needs something to break', () => {
    expect(() => parseActiveProgram(VALID.replace('issues: [DEV-433, DEV-434]', 'issues: []'))).toThrow(/issues/);
  });

  it('rejects an empty ready state list because readiness cannot be guessed', () => {
    expect(() => parseActiveProgram(VALID.replace('readyStates: [Backlog, Todo]', 'readyStates: []'))).toThrow(
      /readyStates/,
    );
  });

  it('rejects an unknown status', () => {
    expect(() => parseActiveProgram(VALID.replace('status: executing', 'status: paused'))).toThrow(/status/);
  });
});

describe("this repository's own active program", () => {
  it('satisfies the contract it ships, so the schema and the file can never drift apart', () => {
    // void-harness authors the contract AND runs under it. Without this, the
    // repo could keep a second, older shape of ACTIVE.md while shipping a parser
    // that rejects it — which is exactly how two forms get established.
    const program = readActiveProgram(new URL('../../../../..', import.meta.url).pathname);

    expect(program?.status).toBe('executing');
    expect(program?.tracker.provider).toBe('linear');
    expect(program?.autopilot.mergeGate).toBe('human');
  });
});

describe('readActiveProgram', () => {
  function repo(): string {
    const root = mkdtempSync(join(tmpdir(), 'vh-active-'));
    mkdirSync(join(root, 'plans'), { recursive: true });
    return root;
  }

  it('returns undefined when the project declares no active program', () => {
    expect(readActiveProgram(repo())).toBeUndefined();
  });

  it('reads the program from its conventional location', () => {
    const root = repo();
    writeFileSync(join(root, 'plans', 'ACTIVE.md'), VALID);

    expect(readActiveProgram(root)?.program).toBe('void-harness-v3');
  });

  it('reads an explicitly named program file inside the repo', () => {
    const root = repo();
    writeFileSync(join(root, 'plans', 'OTHER.md'), VALID);

    expect(readActiveProgram(root, 'plans/OTHER.md')?.program).toBe('void-harness-v3');
  });

  it('refuses a path escaping the repository root', () => {
    expect(() => readActiveProgram(repo(), '../ACTIVE.md')).toThrow(/root/i);
  });

  it('refuses an absolute path', () => {
    expect(() => readActiveProgram(repo(), '/etc/passwd')).toThrow(/root|absolute/i);
  });

  it('surfaces an invalid program instead of silently ignoring it', () => {
    const root = repo();
    writeFileSync(join(root, 'plans', 'ACTIVE.md'), '# no frontmatter\n');

    expect(() => readActiveProgram(root)).toThrow(/frontmatter/i);
  });
});
