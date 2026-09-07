import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAutonomousValueManifest } from '../cases/autonomous-value.js';
import { parsePilotApproval, type PilotApprovalInput } from './approval.js';

function manifest() {
  const result = parseAutonomousValueManifest({
    schemaVersion: 1,
    campaignId: 'pilot-approval-test',
    comparability: {
      runtime: 'codex', model: 'model', modelVersion: 'version', effort: 'high',
      resourceProfile: 'isolated', orderSeed: 'pilot', humanIntervention: 'none',
    },
    cells: ['implement', 'autopilot', 'brainstorm'].flatMap((path) => (
      ['agent-alone', 'implement', 'autopilot'].map((condition) => ({
        id: `${path}-${condition}`,
        path,
        condition,
        startCommit: 'a'.repeat(40),
        objective: `exercise ${path}`,
        defectOracle: ['proof'],
        fixture: `autonomous-value/${path}`,
        fixtureDigest: `sha256:${'b'.repeat(64)}`,
      }))
    )),
  });
  if (!result.ok) throw new Error(`test manifest was not parsed: ${result.error.kind}`);
  return result.value;
}

function approval(overrides: Readonly<Record<string, unknown>> = {}): PilotApprovalInput {
  return {
    schemaVersion: 1,
    campaignId: 'pilot-approval-test',
    approvedBy: 'Folpe',
    approvedAt: '2026-09-07T12:00:00.000Z',
    runtime: 'codex',
    model: 'model',
    modelVersion: 'version',
    effort: 'high',
    resourceProfile: 'isolated',
    artifactDigest: `sha256:${'c'.repeat(64)}`,
    maxExecutions: 27,
    budgetUsd: 10,
    confidence: 0.95,
    minDetectableEffect: 0.1,
    qualityReview: 'blind-human',
    humanIntervention: 'none',
    ...overrides,
  } as PilotApprovalInput;
}

describe('pilot approval contract', () => {
  it('accepts the versioned approval for the committed cohort', () => {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
    const cohort = JSON.parse(readFileSync(
      resolve(repositoryRoot, 'benchmarks/engineering/cohort.json'),
      'utf8',
    )) as unknown;
    const cohortManifest = parseAutonomousValueManifest(cohort);
    if (!cohortManifest.ok) throw new Error(`cohort was not parsed: ${cohortManifest.error.kind}`);
    const approved = JSON.parse(readFileSync(
      resolve(repositoryRoot, 'benchmarks/engineering/pilot-approval.json'),
      'utf8',
    )) as unknown;

    expect(parsePilotApproval(approved, cohortManifest.value).ok).toBe(true);
  });

  it('accepts an explicit approval matching the frozen campaign', () => {
    const result = parsePilotApproval(approval(), manifest());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.maxExecutions).toBe(27);
      expect(result.value.artifactDigest).toMatch(/^sha256:/);
    }
  });

  it.each([
    ['wrong campaign', { campaignId: 'other' }],
    ['wrong runtime', { runtime: 'claude' }],
    ['wrong execution count', { maxExecutions: 26 }],
    ['missing budget', { budgetUsd: 0 }],
    ['wrong review', { qualityReview: 'self' }],
  ] as const)('rejects %s', (_label, override) => {
    const result = parsePilotApproval(approval(override), manifest());

    expect(result.ok).toBe(false);
  });

  it('rejects malformed artifact identity and unknown fields', () => {
    expect(parsePilotApproval(approval({ artifactDigest: 'not-a-digest' }), manifest()).ok).toBe(false);
    expect(parsePilotApproval({ ...approval(), extra: true }, manifest()).ok).toBe(false);
  });
});
