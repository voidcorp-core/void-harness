import { describe, expect, it } from 'vitest';
import { replayEventLog, serializeEvent } from '../index.js';
import { event } from '../test/events.js';
import { DIFF_A, evidenceDraft } from '../test/evidence.js';
import { deriveMissionVerdict } from './verdict.js';
import { sealEvidence } from './schema.js';

const DIFF_B = `sha256:${'c'.repeat(64)}`;

function stream(
  overrides: Parameters<typeof event>[0][] = [],
  duplicate = false,
) {
  const started = event({
    kind: 'mission.started',
    subject: 'mission',
    payload: { title: 'Ship evidence ledger', mode: 'team' },
  });
  const proof = sealEvidence(evidenceDraft());
  const recorded = event({
    seq: 2,
    eventId: 'evt_00000000-0000-4000-8000-000000000002',
    kind: 'evidence.recorded',
    subject: proof.evidenceId,
    payload: { evidence: proof },
  });
  const events = [started, recorded, ...overrides.map((value, index) =>
    event({
      seq: index + 3,
      eventId: `evt_00000000-0000-4000-8000-${String(index + 3).padStart(12, '0')}`,
      ...value,
    })
  )];
  const lines = events.map(serializeEvent);
  if (duplicate) lines.push(serializeEvent(recorded));
  return replayEventLog(`${lines.join('\n')}\n`);
}

describe('mission verdict', () => {
  it('is verified only while its successful proof matches the current diff', () => {
    expect(
      deriveMissionVerdict(stream(), {
        dependencies: { 'git:working-tree': DIFF_A },
      }),
    ).toMatchObject({ status: 'verified', freshEvidence: 1, staleEvidence: 0 });

    expect(
      deriveMissionVerdict(stream(), {
        dependencies: { 'git:working-tree': DIFF_B },
      }),
    ).toMatchObject({
      status: 'unverified',
      freshEvidence: 0,
      staleEvidence: 1,
    });
  });

  it('replays the same projection byte-for-byte without evaluation timestamps', () => {
    const journal = stream();
    const context = { dependencies: { 'git:working-tree': DIFF_A } };

    expect(JSON.stringify(deriveMissionVerdict(journal, context))).toBe(
      JSON.stringify(deriveMissionVerdict(journal, context)),
    );
  });

  it('degrades instead of promoting a tampered or duplicate proof', () => {
    const tampered = sealEvidence(evidenceDraft());
    const tamperedStream = stream([
      {
        kind: 'evidence.recorded',
        payload: { evidence: { ...tampered, durationMs: 42 } },
      },
    ]);

    expect(
      deriveMissionVerdict(tamperedStream, {
        dependencies: { 'git:working-tree': DIFF_A },
      }),
    ).toMatchObject({ status: 'degraded', tamperedEvidence: 1 });
    expect(
      deriveMissionVerdict(stream([], true), {
        dependencies: { 'git:working-tree': DIFF_A },
      }),
    ).toMatchObject({ status: 'degraded' });
  });

  it('degrades a valid event that crosses the mission boundary', () => {
    const foreign = stream([
      {
        missionId: 'mis_ffffffffffffffffffffffffffffffff',
        correlationId: 'mis_ffffffffffffffffffffffffffffffff',
        kind: 'runtime.tool.started',
      },
    ]);

    expect(
      deriveMissionVerdict(foreign, {
        dependencies: { 'git:working-tree': DIFF_A },
      }),
    ).toMatchObject({ status: 'degraded' });
  });

  it('degrades a journal moved under a different mission directory', () => {
    expect(
      deriveMissionVerdict(stream(), {
        missionId: 'mis_ffffffffffffffffffffffffffffffff',
        dependencies: { 'git:working-tree': DIFF_A },
      }),
    ).toMatchObject({ status: 'degraded' });
  });

  it('never lets an exception turn a non-waivable blocker green', () => {
    const blocker = {
      kind: 'finding.reported',
      payload: {
        findingId: 'fnd_secret-leak',
        ruleId: 'security.secret-leak',
        severity: 'critical',
        title: 'Secret leaked',
        blocking: true,
        waivable: false,
        evidenceIds: [],
      },
    };
    const exception = {
      kind: 'finding.exception.granted',
      payload: {
        findingId: 'fnd_secret-leak',
        actor: 'maintainer',
        reason: 'ship anyway',
      },
    };

    expect(
      deriveMissionVerdict(stream([blocker, exception]), {
        dependencies: { 'git:working-tree': DIFF_A },
      }),
    ).toMatchObject({ status: 'blocked', openBlockers: 1 });
  });

  it('labels an accepted waivable blocker as shipped-with-exception', () => {
    const finding = {
      kind: 'finding.reported',
      payload: {
        findingId: 'fnd_known-risk',
        ruleId: 'quality.known-risk',
        severity: 'high',
        title: 'Known compatibility risk',
        blocking: true,
        waivable: true,
        evidenceIds: [],
      },
    };
    const exception = {
      kind: 'finding.exception.granted',
      payload: {
        findingId: 'fnd_known-risk',
        actor: 'maintainer',
        reason: 'Accepted for this release',
      },
    };

    expect(
      deriveMissionVerdict(stream([finding, exception]), {
        dependencies: { 'git:working-tree': DIFF_A },
      }),
    ).toMatchObject({
      status: 'shipped-with-exception',
      acceptedExceptions: 1,
    });
  });

  it('lets a later successful rerun supersede a failed proof for the same input', () => {
    const failed = sealEvidence(evidenceDraft({
      evidenceId: 'evd_00000000-0000-4000-8000-000000000002',
      status: 'failed',
      exitCode: 1,
    }));
    const passed = sealEvidence(evidenceDraft({
      evidenceId: 'evd_00000000-0000-4000-8000-000000000003',
    }));

    expect(
      deriveMissionVerdict(
        stream([
          {
            kind: 'evidence.recorded',
            subject: failed.evidenceId,
            payload: { evidence: failed },
          },
          {
            kind: 'evidence.recorded',
            subject: passed.evidenceId,
            payload: { evidence: passed },
          },
        ]),
        { dependencies: { 'git:working-tree': DIFF_A } },
      ),
    ).toMatchObject({ status: 'verified', failedEvidence: 0 });
  });
});
