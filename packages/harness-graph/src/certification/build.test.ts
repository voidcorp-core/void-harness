import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../model/types.js';
import { buildCertification, serializeCertification } from './build.js';
import type { EvalReportLite } from './types.js';

function skill(name: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id: `skill:${name}`,
    type: 'skill',
    name,
    description: 'x',
    lines: 1,
    pack: null, // allow-null: core skill has no pack
    source: `packages/core/skills/${name}/SKILL.md`,
    owner: 'folpe',
    runtimes: ['claude', 'codex'],
    evalTargets: [{ runtime: 'claude', provider: 'anthropic', tier: 'opus' }],
    ...extra,
  };
}
const model = (nodes: GraphNode[]) => ({ version: 1 as const, nodes, edges: [] });

describe('buildCertification', () => {
  it('marks a capability verified from its structural contract (owner + runtimes)', () => {
    const cert = buildCertification(model([skill('tdd')]), [], '0.16.0');
    expect(cert.harnessVersion).toBe('0.16.0');
    expect(cert.capabilities[0]?.proof.verified).toBe(true);
    expect(cert.capabilities[0]?.proof.effective).toBeUndefined();
  });

  it('is NOT verified when the structural contract is incomplete', () => {
    const cert = buildCertification(model([skill('tdd', { runtimes: [] })]), [], '0.16.0');
    expect(cert.capabilities[0]?.proof.verified).toBe(false);
  });

  it('marks effective only on a real skill-helps report, placing the delta on the declared cell', () => {
    const reports: EvalReportLite[] = [{ skill: 'tdd', delta: 0.31, verdict: 'skill-helps' }];
    const cert = buildCertification(model([skill('tdd')]), reports, '0.16.0');
    expect(cert.capabilities[0]?.proof.effective).toEqual({
      cells: [{ runtime: 'claude', provider: 'anthropic', tier: 'opus', delta: 0.31 }],
    });
  });

  it('honesty invariant: a no-signal / skill-hurts report never yields effective', () => {
    for (const verdict of ['no-signal', 'skill-hurts'] as const) {
      const cert = buildCertification(model([skill('tdd')]), [{ skill: 'tdd', delta: 0.02, verdict }], '0.16.0');
      expect(cert.capabilities[0]?.proof.effective).toBeUndefined();
    }
  });

  it('honesty invariant: a non-finite delta (NaN, from an upstream null) never yields effective', () => {
    const cert = buildCertification(model([skill('tdd')]), [{ skill: 'tdd', delta: Number.NaN, verdict: 'skill-helps' }], '0.16.0');
    expect(cert.capabilities[0]?.proof.effective).toBeUndefined();
  });

  it('honesty invariant: withholds effective on a multi-target capability (report carries no cell identity to attribute)', () => {
    const twoTargets = skill('tdd', {
      evalTargets: [
        { runtime: 'claude', provider: 'anthropic', tier: 'opus' },
        { runtime: 'codex', provider: 'openai', tier: 'gpt' },
      ],
    });
    const cert = buildCertification(model([twoTargets]), [{ skill: 'tdd', delta: 0.4, verdict: 'skill-helps' }], '0.16.0');
    expect(cert.capabilities[0]?.proof.effective).toBeUndefined();
  });

  it('effective implies verified: an unverified capability never carries an effective proof', () => {
    const cert = buildCertification(
      model([skill('tdd', { runtimes: [] })]),
      [{ skill: 'tdd', delta: 0.4, verdict: 'skill-helps' }],
      '0.16.0',
    );
    expect(cert.capabilities[0]?.proof.verified).toBe(false);
    expect(cert.capabilities[0]?.proof.effective).toBeUndefined();
  });

  it('cannot place effective when the capability declares no eval target', () => {
    const cert = buildCertification(
      model([skill('tdd', { evalTargets: [] })]),
      [{ skill: 'tdd', delta: 0.4, verdict: 'skill-helps' }],
      '0.16.0',
    );
    expect(cert.capabilities[0]?.proof.effective).toBeUndefined();
  });

  it('includes only skills, sorted by id, and carries the declared contract', () => {
    const hook: GraphNode = {
      id: 'hook:tdd-guard',
      type: 'hook',
      name: 'tdd-guard',
      description: '',
      lines: 1,
      pack: null, // allow-null: hook has no pack
      source: 's',
    };
    const cert = buildCertification(model([skill('testing'), hook, skill('accessibility-first')]), [], '0.16.0');
    expect(cert.capabilities.map((c) => c.id)).toEqual(['skill:accessibility-first', 'skill:testing']);
    expect(cert.capabilities[0]?.runtimes).toEqual(['claude', 'codex']);
  });

  it('serializes deterministically with a trailing newline', () => {
    const cert = buildCertification(model([skill('tdd')]), [], '0.16.0');
    const out = serializeCertification(cert);
    expect(out.endsWith('\n')).toBe(true);
    expect(serializeCertification(cert)).toBe(out);
  });
});
