import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHAIN_BUDGET_MS } from './chain.js';
import {
  LEGACY_PROGRAM_PATHS,
  PROGRAM_PATH,
  parseProgramDescriptor,
  programPath,
  readProgramDescriptor,
} from './program.js';

const VALID = `---
schemaVersion: 1
status: executing
program: void-harness-v3
plan: docs/plans/2026-07-24-plan.md
spec: docs/specs/2026-07-24-spec.md
progress:
  provider: linear
  scope: voidcorp/DEV/void harness
  order: [DEV-433, DEV-434]
  states:
    ready: [Backlog, Todo]
    started: [In Progress]
    review: [In Review]
    done: [Done]
humanGates: [DEV-433]
autopilot:
  schemaVersion: 1
  clusterSize: 4
  base: auto
  mergeGate: human
  verifyCommands:
    - [pnpm, build]
    - [pnpm, test]
  ownership:
    sequential: [pnpm-lock.yaml]
    reconcileOnly: []
---

# Program
`;

const LEGACY = VALID
  .replace('schemaVersion: 1\n', '')
  .replace(
    `progress:
  provider: linear
  scope: voidcorp/DEV/void harness
  order: [DEV-433, DEV-434]
  states:
    ready: [Backlog, Todo]
    started: [In Progress]
    review: [In Review]
    done: [Done]`,
    `tracker:
  provider: linear
  scope: voidcorp/DEV/void harness
  issues: [DEV-433, DEV-434]
  readyStates: [Backlog, Todo]
  startedState: In Progress
  reviewState: In Review
  doneStates: [Done]`,
  );

function withAutopilot(block: string): string {
  return VALID.replace(/autopilot:\n(?:.*\n)*?---/, `${block}\n---`);
}

function withoutProgress(text: string): string {
  return text.replace(/progress:\n(?:.*\n)*?humanGates:/, 'humanGates:');
}

describe('parseProgramDescriptor', () => {
  it('reads a provider-agnostic program descriptor', () => {
    const descriptor = parseProgramDescriptor(VALID.replace('provider: linear', 'provider: jira'));

    expect(descriptor.schemaVersion).toBe(1);
    expect(descriptor.status).toBe('executing');
    expect(descriptor.program).toBe('void-harness-v3');
    expect(descriptor.progress).toEqual({
      provider: 'jira',
      scope: 'voidcorp/DEV/void harness',
      order: ['DEV-433', 'DEV-434'],
      states: {
        ready: ['Backlog', 'Todo'],
        started: ['In Progress'],
        review: ['In Review'],
        done: ['Done'],
      },
    });
    expect(descriptor.humanGates).toEqual(['DEV-433']);
    expect(descriptor.autopilot?.clusterSize).toBe(4);
  });

  // A chain that merges on its own needs a bound, and the bound belongs in the
  // programme next to the consent rather than on a command line: a run nobody
  // watches must not be able to widen its own blast radius.
  it('takes a chain budget as a duration, defaulting to two hours', () => {
    expect(parseProgramDescriptor(VALID).autopilot?.chainBudgetMs).toBe(DEFAULT_CHAIN_BUDGET_MS);
    expect(parseProgramDescriptor(VALID.replace('  clusterSize: 4', '  clusterSize: 4\n  chainBudget: 6h'))
      .autopilot?.chainBudgetMs).toBe(6 * 60 * 60_000);
  });

  it('refuses a budget that is not a duration, rather than guessing hours', () => {
    for (const bad of ['0h', 'soon', '6', '48h']) {
      expect(() => parseProgramDescriptor(VALID.replace('  clusterSize: 4', `  clusterSize: 4\n  chainBudget: ${bad}`)), bad)
        .toThrow(/chain budget/i);
    }
  });

  // Declaring the block IS the consent, so the opt-out is not writing one.
  // Nobody configures a feature in full in order to disable it.
  it('treats an absent autopilot block as the opt-out, and asks nothing more of it', () => {
    const descriptor = parseProgramDescriptor(withoutProgress(withAutopilot('')));

    expect(descriptor.autopilot).toBeUndefined();
    expect(descriptor.progress).toBeUndefined();
  });

  // `enabled: false` is how a project takes back a consent it once gave. Deleting
  // the block would do it too, at the cost of `base`, `mergeGate`, `verifyCommands`
  // and `ownership` -- fifteen lines to remove and restore by hand, which is where
  // the mistake gets made. So the field is read, and the block stays where it is.
  it('reads `enabled: false` as the consent taken back, and reports which one it was', () => {
    const descriptor = parseProgramDescriptor(
      VALID.replace('  clusterSize: 4', '  enabled: false\n  clusterSize: 4'),
    );

    expect(descriptor.autopilot).toBeUndefined();
    expect(descriptor.autopilotConsentWithheld).toBe(true);
  });

  it('keeps consent when `enabled` is absent, and when it is written true', () => {
    const implicit = parseProgramDescriptor(VALID);
    expect(implicit.autopilot?.clusterSize).toBe(4);
    expect(implicit.autopilotConsentWithheld).toBe(false);

    const explicit = parseProgramDescriptor(
      VALID.replace('  clusterSize: 4', '  enabled: true\n  clusterSize: 4'),
    );
    expect(explicit.autopilot?.clusterSize).toBe(4);
    expect(explicit.autopilotConsentWithheld).toBe(false);
  });

  // The direction of the failure decides this. Reading `"false"` as consent is a
  // run nobody authorised; refusing it costs one corrected line.
  it('refuses an `enabled` that is not a boolean rather than reading it as consent', () => {
    for (const bad of ['"false"', 'off', '0', '[]']) {
      expect(
        () => parseProgramDescriptor(VALID.replace('  clusterSize: 4', `  enabled: ${bad}\n  clusterSize: 4`)),
        bad,
      ).toThrow(/enabled/);
    }
  });

  // A block that is present but wrong is an error here as everywhere else. The
  // alternative is a descriptor that rots unread while it is disabled and fails
  // on the day someone turns it back on, which is the worst moment to find out.
  it('validates a disabled block instead of waving it through', () => {
    expect(() =>
      parseProgramDescriptor(
        VALID.replace('  clusterSize: 4', '  enabled: false\n  clusterSize: 9'),
      ),
    ).toThrow(/cluster size/i);
  });

  it('rejects autonomous selection without a progress source', () => {
    expect(() => parseProgramDescriptor(withoutProgress(VALID))).toThrow(/progress/);
  });

  it('requires the root schema version on a canonical descriptor', () => {
    expect(() => parseProgramDescriptor(VALID.replace('schemaVersion: 1\n', ''))).toThrow(
      /schemaVersion/,
    );
    expect(() => parseProgramDescriptor(VALID.replace('schemaVersion: 1', 'schemaVersion: 2'))).toThrow(
      /schemaVersion/,
    );
  });

  it('rejects a progress block with an empty provider or state role', () => {
    expect(() => parseProgramDescriptor(VALID.replace('provider: linear', 'provider: ""'))).toThrow(
      /provider/,
    );
    expect(() => parseProgramDescriptor(VALID.replace('ready: [Backlog, Todo]', 'ready: []'))).toThrow(
      /progress.states.ready/,
    );
  });

  it('rejects a progress block with an empty deterministic order', () => {
    expect(() => parseProgramDescriptor(VALID.replace('order: [DEV-433, DEV-434]', 'order: []'))).toThrow(
      /progress.order/,
    );
  });

  it('rejects a file with no frontmatter or invalid YAML', () => {
    expect(() => parseProgramDescriptor('# just a heading\n')).toThrow(/frontmatter/i);
    expect(() => parseProgramDescriptor('---\nstatus: [unclosed\n---\n')).toThrow(/YAML/i);
  });

  it('reports failures through the provider-agnostic program error code', () => {
    let thrown: unknown;
    try {
      parseProgramDescriptor('# no frontmatter\n');
    } catch (error) {
      thrown = error;
    }

    expect((thrown as { failure: { code: string } }).failure.code).toBe('AUTOPILOT_PROGRAM');
  });

  it('never reads a declared progress provider as consent to autonomy', () => {
    // The inverse of the rule the mandatory-flag test used to protect, and the
    // one that actually matters: a project can wire its tracker for `resume`,
    // `status` and the lifecycle without ever asking for autonomous selection.
    // Inferring consent from a provider would hand it autonomy it never sought.
    const descriptor = parseProgramDescriptor(VALID.replace(/autopilot:\n(?:.*\n)*?---/, '---'));

    expect(descriptor?.autopilot).toBeUndefined();
    expect(descriptor?.progress?.provider).toBe('linear');
  });

  it('rejects unsafe autopilot commands and paths', () => {
    const shellCommand =
      'autopilot:\n  schemaVersion: 1\n  mergeGate: human\n  verifyCommands:\n    - pnpm test';
    expect(() => parseProgramDescriptor(withAutopilot(shellCommand))).toThrow(/verifyCommands/);
    expect(() => parseProgramDescriptor(VALID.replace('docs/plans/2026-07-24-plan.md', '/etc/passwd'))).toThrow(
      /plan/,
    );
    expect(() =>
      parseProgramDescriptor(VALID.replace('sequential: [pnpm-lock.yaml]', 'sequential: [../../etc/hosts]')),
    ).toThrow(/ownership/);
  });

  // `union-reviewed` is the gate the union-is-read-before-it-merges record
  // grants: an integration branch may merge itself once an adversarial reading
  // of the whole diff came back clean, and the human moves to the promotion.
  it('accepts the union-reviewed gate when the deploying branch is named', () => {
    const descriptor = parseProgramDescriptor(
      VALID.replace('mergeGate: human', 'mergeGate: union-reviewed\n  deployBranch: main'),
    );

    expect(descriptor?.autopilot?.mergeGate).toBe('union-reviewed');
    expect(descriptor?.autopilot?.deployBranch).toBe('main');
  });

  it('refuses to grant the merge without knowing which branch deploys', () => {
    // Defaulting to `main` would be the name-based guess the record rejects: a
    // project shipping from `production`, or from `develop` itself, would get
    // the human gate in the wrong place and never notice.
    expect(() => parseProgramDescriptor(VALID.replace('mergeGate: human', 'mergeGate: union-reviewed')))
      .toThrow(/deployBranch/);
  });

  it('refuses a gate that would integrate straight into the deploying branch', () => {
    // Declaring union-reviewed while every integration targets production is a
    // contradiction, and it is better said once here than discovered as a
    // refusal on every merge.
    expect(() => parseProgramDescriptor(
      VALID
        .replace('base: auto', 'base: main')
        .replace('mergeGate: human', 'mergeGate: union-reviewed\n  deployBranch: main'),
    )).toThrow(/deployBranch/);
  });

  it('leaves deployBranch absent when the gate is human, which needs no such thing', () => {
    expect(parseProgramDescriptor(VALID)?.autopilot?.deployBranch).toBeUndefined();
  });

  it('rejects unknown status, merge gate and cluster size values', () => {
    expect(() => parseProgramDescriptor(VALID.replace('status: executing', 'status: paused'))).toThrow(
      /status/,
    );
    expect(() => parseProgramDescriptor(VALID.replace('mergeGate: human', 'mergeGate: auto'))).toThrow(
      /mergeGate/,
    );
    expect(() => parseProgramDescriptor(VALID.replace('clusterSize: 4', 'clusterSize: 5'))).toThrow(
      /clusterSize/,
    );
  });
});

describe('readProgramDescriptor', () => {
  function repo(): string {
    const root = mkdtempSync(join(tmpdir(), 'vh-program-'));
    mkdirSync(join(root, '.void'), { recursive: true });
    mkdirSync(join(root, 'plans'), { recursive: true });
    return root;
  }

  it('returns undefined and the canonical write path when no program exists', () => {
    const root = repo();

    expect(readProgramDescriptor(root)).toBeUndefined();
    expect(programPath(root)).toBe(PROGRAM_PATH);
  });

  it('reads the canonical program descriptor', () => {
    const root = repo();
    writeFileSync(join(root, PROGRAM_PATH), VALID);

    expect(readProgramDescriptor(root)?.program).toBe('void-harness-v3');
  });

  it.each(LEGACY_PROGRAM_PATHS)('reads and adapts the legacy schema from %s', (legacyPath) => {
    const root = repo();
    writeFileSync(join(root, legacyPath), LEGACY);

    const descriptor = readProgramDescriptor(root);

    expect(descriptor?.schemaVersion).toBe(1);
    expect(descriptor?.progress?.order).toEqual(['DEV-433', 'DEV-434']);
    expect(programPath(root)).toBe(legacyPath);
  });

  it('rejects a legacy schema at the canonical path', () => {
    const root = repo();
    writeFileSync(join(root, PROGRAM_PATH), LEGACY);

    expect(() => readProgramDescriptor(root)).toThrow(/schemaVersion/);
  });

  it('rejects every ambiguous combination instead of silently choosing one', () => {
    for (const pair of [
      [PROGRAM_PATH, LEGACY_PROGRAM_PATHS[0]],
      [PROGRAM_PATH, LEGACY_PROGRAM_PATHS[1]],
      [LEGACY_PROGRAM_PATHS[0], LEGACY_PROGRAM_PATHS[1]],
    ] as const) {
      const root = repo();
      for (const relativePath of pair) writeFileSync(join(root, relativePath), VALID);

      expect(() => programPath(root)).toThrow(/multiple|ambiguous/i);
      expect(() => readProgramDescriptor(root)).toThrow(/multiple|ambiguous/i);
    }
  });

  it('reads an explicitly named descriptor inside the repository', () => {
    const root = repo();
    writeFileSync(join(root, 'plans', 'OTHER.md'), VALID);

    expect(readProgramDescriptor(root, 'plans/OTHER.md')?.program).toBe('void-harness-v3');
  });

  it('refuses an explicit path outside the repository', () => {
    expect(() => readProgramDescriptor(repo(), '../program.md')).toThrow(/root/i);
    expect(() => readProgramDescriptor(repo(), '/etc/passwd')).toThrow(/root|absolute/i);
  });
});

describe("this repository's program", () => {
  it('satisfies the same canonical contract it ships', () => {
    const descriptor = readProgramDescriptor(new URL('../../../../..', import.meta.url).pathname);

    expect(descriptor?.status).toBe('executing');
    expect(descriptor?.progress?.provider).toBe('linear');
    // This repository integrates into develop and ships from main, so it takes
    // the granted gate. The pair is asserted rather than the value alone: a
    // deploy branch equal to the base would make every merge refuse, and the
    // refusal would look like a bug in the gate rather than a wrong descriptor.
    expect(descriptor?.autopilot?.mergeGate).toBe('union-reviewed');
    expect(descriptor?.autopilot?.deployBranch).toBe('main');
    expect(descriptor?.autopilot?.deployBranch).not.toBe(descriptor?.autopilot?.base);
  });
});
