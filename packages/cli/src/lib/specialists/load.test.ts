import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSpecialists, MAX_SPECIALIST_FILE_BYTES, parseSpecialistYaml } from './load.js';

const YAML_CONTRACT = `schemaVersion: 1
id: core:solution-architect
version: 1
name: solution-architect
description: Reviews architecture without editing the project.
scope: architecture
independence: fresh-context
writeAccess: none
appliesWhen:
  any: [architecture-impact]
inputs: [ticket, plan, diff]
outputs: [verdict, findings, evidenceRequests, limitations]
budgets:
  contextTokens: 12000
  maxTurns: 2
failurePolicy: block-on-critical
instructions: Review boundaries and return grounded findings only.
`;

function sourceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'void-specialists-'));
  mkdirSync(join(root, 'specialists'), { recursive: true });
  return root;
}

describe('parseSpecialistYaml', () => {
  it('parses strict YAML with aliases disabled', () => {
    expect(parseSpecialistYaml(YAML_CONTRACT, 'solution-architect.yaml').id).toBe('core:solution-architect');
    expect(() => parseSpecialistYaml('a: &x [1]\nb: *x\n', 'alias.yaml')).toThrow(/SPECIALIST_YAML_INVALID/);
    expect(() => parseSpecialistYaml('id: one\nid: two\n', 'duplicate.yaml')).toThrow(/SPECIALIST_YAML_INVALID/);
  });

  it('bounds source bytes before parsing', () => {
    expect(() => parseSpecialistYaml('x'.repeat(MAX_SPECIALIST_FILE_BYTES + 1), 'huge.yaml')).toThrow(/exceeds/i);
  });
});

describe('loadSpecialists', () => {
  it('loads canonical files deterministically and refuses duplicate identities', async () => {
    const root = sourceRoot();
    writeFileSync(join(root, 'specialists', 'b.yaml'), YAML_CONTRACT.replaceAll('solution-architect', 'test-qa-engineer').replace('architecture', 'quality'));
    writeFileSync(join(root, 'specialists', 'a.yaml'), YAML_CONTRACT);
    await expect(loadSpecialists(root)).resolves.toHaveLength(2);

    writeFileSync(join(root, 'specialists', 'c.yaml'), YAML_CONTRACT);
    await expect(loadSpecialists(root)).rejects.toThrow(/duplicate specialist id/i);
  });

  it('returns an empty list for an absent directory and refuses symlinked inputs', async () => {
    await expect(loadSpecialists(mkdtempSync(join(tmpdir(), 'void-no-specialists-')))).resolves.toEqual([]);
    const root = sourceRoot();
    const outside = join(mkdtempSync(join(tmpdir(), 'void-specialist-outside-')), 'escape.yaml');
    writeFileSync(outside, YAML_CONTRACT);
    symlinkSync(outside, join(root, 'specialists', 'escape.yaml'));
    await expect(loadSpecialists(root)).rejects.toThrow(/symbolic link/i);
  });
});
