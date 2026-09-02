import { describe, expect, it } from 'vitest';
import { ARCHITECT_CONTRACT } from './__fixtures__/contract.js';
import {
  MAX_SPECIALIST_OUTPUT_BYTES,
  parseSpecialistCompletion,
  parseSpecialistContract,
  renderSpecialistInstructions,
} from './schema.js';

function completion(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    specialistId: 'core:solution-architect',
    contractVersion: 1,
    completionId: 'completion-architecture-001',
    verdict: 'pass',
    findings: [],
    evidenceRequests: [],
    limitations: [],
    ...overrides,
  };
}

describe('parseSpecialistContract', () => {
  it('accepts one strict, bounded canonical contract', () => {
    expect(ARCHITECT_CONTRACT).toMatchObject({
      id: 'core:solution-architect',
      independence: 'fresh-context',
      writeAccess: 'none',
      budgets: { contextTokens: 12_000, maxTurns: 2 },
    });
  });

  it('rejects empty, unknown, and unsafe contract shapes', () => {
    expect(() => parseSpecialistContract(undefined, 'empty.yaml')).toThrow(/SPECIALIST_CONTRACT_INVALID.*empty\.yaml/);
    expect(() => parseSpecialistContract({ ...ARCHITECT_CONTRACT, surprise: true }, 'unknown.yaml')).toThrow(/unrecognized/i);
    expect(() => parseSpecialistContract({ ...ARCHITECT_CONTRACT, writeAccess: 'project' }, 'write.yaml')).toThrow(/writeAccess/);
    expect(() => parseSpecialistContract({ ...ARCHITECT_CONTRACT, independence: 'shared-context' }, 'context.yaml')).toThrow(/independence/);
  });

  it('accepts 500 description characters and rejects 501', () => {
    expect(parseSpecialistContract({ ...ARCHITECT_CONTRACT, description: 'x'.repeat(500) }, 'target.yaml').description)
      .toHaveLength(500);
    expect(() => parseSpecialistContract(
      { ...ARCHITECT_CONTRACT, description: 'x'.repeat(501) },
      'over-cap.yaml',
    )).toThrow(/description.*500/i);
  });

  it('renders the failure-policy invariants into every native agent contract', () => {
    const instructions = renderSpecialistInstructions(ARCHITECT_CONTRACT);

    expect(instructions).toContain('`critical` finding requires the `blocked` verdict');
    expect(instructions).toContain('`blocked` or `degraded` verdict requires');
    expect(instructions).toContain('sandboxed command tool');
    expect(instructions).toContain('never run scripts, builds, tests');
  });
});

describe('parseSpecialistCompletion', () => {
  it('accepts the common structured output contract', () => {
    expect(parseSpecialistCompletion(JSON.stringify(completion()), ARCHITECT_CONTRACT, [])).toMatchObject({
      specialistId: ARCHITECT_CONTRACT.id,
      completionId: 'completion-architecture-001',
      verdict: 'pass',
    });
  });

  it('rejects empty, malformed, oversized, wrong-role, and double completions', () => {
    expect(() => parseSpecialistCompletion('', ARCHITECT_CONTRACT, [])).toThrow(/SPECIALIST_OUTPUT_INVALID.*empty/i);
    expect(() => parseSpecialistCompletion('{', ARCHITECT_CONTRACT, [])).toThrow(/SPECIALIST_OUTPUT_INVALID.*JSON/i);
    expect(() => parseSpecialistCompletion('x'.repeat(MAX_SPECIALIST_OUTPUT_BYTES + 1), ARCHITECT_CONTRACT, [])).toThrow(/exceeds/i);
    expect(() => parseSpecialistCompletion(
      JSON.stringify(completion({ specialistId: 'core:security-engineer' })),
      ARCHITECT_CONTRACT,
      [],
    )).toThrow(/wrong specialist/i);
    expect(() => parseSpecialistCompletion(
      JSON.stringify(completion()),
      ARCHITECT_CONTRACT,
      ['completion-architecture-001'],
    )).toThrow(/duplicate completion/i);
  });

  it('rejects ungrounded findings and extra output fields', () => {
    expect(() => parseSpecialistCompletion(JSON.stringify(completion({
      findings: [{
        id: 'architecture-001',
        severity: 'high',
        summary: 'A boundary is reversed.',
        evidence: [],
        recommendation: 'Restore inward dependency direction.',
      }],
    })), ARCHITECT_CONTRACT, [])).toThrow(/canonical completion contract/i);
    expect(() => parseSpecialistCompletion(
      JSON.stringify(completion({ commentary: 'looks good' })),
      ARCHITECT_CONTRACT,
      [],
    )).toThrow(/canonical completion contract/i);
  });

  it('enforces the canonical block-on-critical failure policy', () => {
    expect(() => parseSpecialistCompletion(JSON.stringify(completion({
      verdict: 'pass',
      findings: [{
        id: 'critical-boundary',
        severity: 'critical',
        summary: 'The boundary permits an unrecoverable violation.',
        evidence: [{ path: 'src/boundary.ts', line: 7, detail: 'The guard is bypassed.' }],
        recommendation: 'Restore the guard before continuing.',
      }],
    })), ARCHITECT_CONTRACT, [])).toThrow(/canonical completion contract/i);
  });
});

describe('the convened specialist is told not to explore', () => {
  const body = renderSpecialistInstructions(ARCHITECT_CONTRACT);

  it('names the context pack as what it reads, in both runtimes', () => {
    expect(body).toContain('context pack');
  });

  it('forbids searching for what it was already handed', () => {
    // Measured 2026-08-30: with two turns and a broken `rg`, five specialists
    // spent both turns exploring and returned a transition sentence. The pack
    // only pays off if the instruction stops the search it replaces.
    expect(body).toMatch(/do not (search|explore)/i);
  });

  it('makes a specialist that must go beyond the pack declare it', () => {
    expect(body).toMatch(/limitations/);
  });
});
