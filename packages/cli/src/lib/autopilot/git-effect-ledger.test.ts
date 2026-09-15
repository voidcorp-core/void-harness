import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyGitEffect,
  claimGitEffect,
  createGitEffectRequest,
  markGitEffectAmbiguous,
  openGitEffectLedger,
} from './git-effect-ledger.js';

const roots: string[] = [];
const ledgers: Array<ReturnType<typeof openGitEffectLedger>> = [];
const request = createGitEffectRequest({
  runId: 'run-1', unitId: 'DEV-814', revision: 4, ordinal: 0,
  declaredFiles: ['src/b.ts', 'src/a.ts'], payload: 'commit changes',
});
const proof = {
  effectId: request.effectId,
  baseSha: '1111111111111111111111111111111111111111',
  headSha: '2222222222222222222222222222222222222222',
  treeSha: '3333333333333333333333333333333333333333',
  sourceSha: '4444444444444444444444444444444444444444',
  files: ['src/a.ts', 'src/b.ts'],
};

afterEach(() => {
  for (const ledger of ledgers.splice(0)) ledger.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('durable Git effect ledger', () => {
  it('derives one stable identity from the canonical request', () => {
    const reordered = createGitEffectRequest({ ...request, declaredFiles: ['src/a.ts', 'src/b.ts'] });
    expect(reordered.effectId).toBe(request.effectId);
    expect(request.effectId).toMatch(/^effect-v1:sha256:[0-9a-f]{64}$/);
  });

  it('claims once, survives reopening, and applies one proof', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-git-effect-'));
    roots.push(root);
    const first = openGitEffectLedger(join(root, 'effects.sqlite'));
    ledgers.push(first);
    expect(claimGitEffect(first, request, 7).state).toBe('claimed');
    first.close();
    ledgers.splice(ledgers.indexOf(first), 1);
    const resumed = openGitEffectLedger(join(root, 'effects.sqlite'));
    ledgers.push(resumed);
    expect(claimGitEffect(resumed, request, 7).state).toBe('claimed');
    expect(applyGitEffect(resumed, request.effectId, 7, proof)).toMatchObject({ state: 'applied', proof });
    expect(applyGitEffect(resumed, request.effectId, 7, proof)).toMatchObject({ state: 'applied', proof });
  });

  it('rejects stale fencing and refuses an ambiguous effect forever', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-git-effect-'));
    roots.push(root);
    const ledger = openGitEffectLedger(join(root, 'effects.sqlite'));
    ledgers.push(ledger);
    claimGitEffect(ledger, request, 9);
    expect(() => claimGitEffect(ledger, request, 8)).toThrow('stale');
    expect(() => claimGitEffect(ledger, request, 10)).toThrow('stale');
    markGitEffectAmbiguous(ledger, request.effectId, 9, 'command timed out');
    expect(() => claimGitEffect(ledger, request, 10)).toThrow('ambiguous');
    expect(() => applyGitEffect(ledger, request.effectId, 9, proof)).toThrow('ambiguous');
  });

  it('refuses proof files that widen the declared footprint', () => {
    const root = mkdtempSync(join(tmpdir(), 'void-git-effect-'));
    roots.push(root);
    const ledger = openGitEffectLedger(join(root, 'effects.sqlite'));
    ledgers.push(ledger);
    claimGitEffect(ledger, request, 1);
    expect(() => applyGitEffect(ledger, request.effectId, 1, { ...proof, files: ['src/a.ts'] })).toThrow('footprint');
  });
});
