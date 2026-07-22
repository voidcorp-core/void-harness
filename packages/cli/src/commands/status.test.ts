import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Certification, ProjectState, Score } from '@voidcorp/harness-graph';
import { capabilityPackDir } from '@voidcorp/harness-graph';
import { describe, expect, it } from 'vitest';
import { PACKS } from '../lib/packs.js';
import { activatedPackDirs, dataCandidates, statusLines, usedCountsById } from './status.js';

describe('activatedPackDirs', () => {
  it('maps @voidcorp/harness-<x> config keys to pack-<x> dirs, skipping core', () => {
    const dirs = activatedPackDirs({
      packs: { '@voidcorp/harness-monorepo': '^1.0.0', '@voidcorp/harness-nextjs': '^1.0.0', '@voidcorp/harness': '^1.0.0' },
    });
    expect([...dirs].sort()).toEqual(['pack-monorepo', 'pack-nextjs']);
  });

  it('returns an empty set when there are no packs', () => {
    expect(activatedPackDirs({}).size).toBe(0);
  });

  it('drift guard: every PACKS entry maps to a pack dir present in the real certification', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const certPath = resolve(here, '..', '..', '..', 'harness-graph', 'certification.json');
    const cert = JSON.parse(readFileSync(certPath, 'utf8')) as Certification;
    const certDirs = new Set(cert.capabilities.map((c) => capabilityPackDir(c.id)).filter(Boolean));
    for (const pack of PACKS) {
      const [dir] = activatedPackDirs({ packs: { [`@voidcorp/${pack.name}`]: '^1' } });
      expect(certDirs.has(dir), `${pack.name} -> ${dir} not found in certification`).toBe(true);
    }
  });
});

describe('dataCandidates', () => {
  it('prefers the monorepo source, then falls back to the package-local shipped copy', () => {
    expect(dataCandidates('/x/packages/cli', 'certification.json')).toEqual([
      '/x/packages/harness-graph/certification.json',
      '/x/packages/cli/core-assets/data/certification.json',
    ]);
  });

  it('resolves the package-local copy under a published install root', () => {
    const [, packaged] = dataCandidates('/n/node_modules/@voidfactory/harness', 'model.json');
    expect(packaged).toBe('/n/node_modules/@voidfactory/harness/core-assets/data/model.json');
  });
});

const cert: Certification = {
  schemaVersion: 1,
  harnessVersion: '0.16.0',
  capabilities: [
    { id: 'skill:tdd', owner: 'folpe', runtimes: ['claude'], evalTargets: [], proof: { verified: true } },
    { id: 'skill:pack-nextjs/cache', owner: 'folpe', runtimes: ['claude'], evalTargets: [], proof: { verified: true } },
  ],
};

describe('usedCountsById', () => {
  it('counts skill activations and keys them by capability id (core and pack-scoped)', () => {
    const events = [
      { kind: 'skill', name: 'tdd' },
      { kind: 'skill', name: 'tdd' },
      { kind: 'skill', name: 'cache' },
      { kind: 'tool', name: 'tdd' }, // non-skill ignored
      { kind: 'skill', name: 'unknown' }, // not in cert, dropped
    ];
    const counts = usedCountsById(events, cert);
    expect(counts.get('skill:tdd')).toBe(2);
    expect(counts.get('skill:pack-nextjs/cache')).toBe(1);
    expect(counts.has('skill:unknown')).toBe(false);
  });

  it('excludes an ambiguous bare name shared by two capabilities rather than mis-attributing it', () => {
    const clashing: Certification = {
      schemaVersion: 1,
      harnessVersion: '0.16.0',
      capabilities: [
        { id: 'skill:tdd', owner: 'folpe', runtimes: ['claude'], evalTargets: [], proof: { verified: true } },
        { id: 'skill:pack-vue/tdd', owner: 'folpe', runtimes: ['claude'], evalTargets: [], proof: { verified: true } },
      ],
    };
    const counts = usedCountsById([{ kind: 'skill', name: 'tdd' }, { kind: 'skill', name: 'tdd' }], clashing);
    // cannot tell which 'tdd' fired — attribute to neither, never silently pick a winner
    expect(counts.has('skill:tdd')).toBe(false);
    expect(counts.has('skill:pack-vue/tdd')).toBe(false);
  });
});

describe('statusLines', () => {
  const state: ProjectState = {
    schemaVersion: 1,
    harnessVersion: '0.16.0',
    capabilities: [
      { id: 'skill:tdd', state: 'used', verified: true, usedCount: 4 },
      { id: 'skill:qa', state: 'installed', verified: true, usedCount: 0 },
    ],
    runtimes: [
      { runtime: 'claude', detected: true },
      { runtime: 'hermes', detected: false },
    ],
  };
  const score: Score = {
    global: 62,
    confidence: 'low',
    capped: false,
    blockers: [],
    dimensions: [
      { key: 'installation', kind: 'blocker', score: null, red: false, detail: 'pending signal' },
      { key: 'enforcement', kind: 'blocker', score: 87, red: false, perRuntime: { claude: 100, hermes: 60 } },
      { key: 'governance', kind: 'blocker', score: 100, red: false, detail: 'all owned' },
    ],
    nextActions: [{ rank: 1, title: 'Evaluate critical capabilities', impact: 8 }],
  };

  it('renders the health header with score and confidence', () => {
    expect(statusLines(state, score)[0]).toContain('VOID PROJECT HEALTH   62/100   confidence: low');
  });

  it('adds the Codex usage-measurement note only when Codex is detected', () => {
    // no codex here -> no note
    expect(statusLines(state, score).join('\n')).not.toContain('Codex does not surface skill use');
    const withCodex: ProjectState = { ...state, runtimes: [{ runtime: 'codex', detected: true }] };
    expect(statusLines(withCodex, score).join('\n')).toContain('Codex does not surface skill use');
  });

  it('shows a pending dimension as "pending", never a fabricated number', () => {
    const text = statusLines(state, score).join('\n');
    expect(text).toMatch(/installation\s+pending/);
    expect(text).toMatch(/enforcement\s+87%/);
  });

  it('summarizes capability states and runtimes, and lists next actions', () => {
    const text = statusLines(state, score).join('\n');
    expect(text).toContain('1 used');
    expect(text).toContain('1 installed');
    expect(text).toContain('claude verified');
    expect(text).toContain('hermes missing');
    expect(text).toContain('1. Evaluate critical capabilities');
  });

  it('marks a capped score with its blockers in the header', () => {
    const capped: Score = { ...score, capped: true, blockers: ['governance'], global: 69 };
    expect(statusLines(state, capped)[0]).toContain('(capped: governance)');
  });
});
