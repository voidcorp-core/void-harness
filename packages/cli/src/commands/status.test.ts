import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
    const certPath = resolve(here, '..', '..', '..', 'core', 'data', 'certification.json');
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
      '/x/packages/core/data/certification.json',
      '/x/packages/cli/core-assets/data/certification.json',
    ]);
  });

  it('resolves the package-local copy under a published install root', () => {
    const [, packaged] = dataCandidates('/n/node_modules/voidharness', 'model.json');
    expect(packaged).toBe('/n/node_modules/voidharness/core-assets/data/model.json');
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
      { id: 'skill:tdd', state: 'used', verified: true, certified: true, usedCount: 4 },
      { id: 'skill:qa', state: 'installed', verified: false, certified: true, usedCount: 0 },
    ],
    runtimes: [
      {
        runtime: 'claude',
        detected: true,
        evidence: { installed: true, wired: true, fired: true, observed: true, certified: true },
      },
      {
        runtime: 'hermes',
        detected: false,
        evidence: { installed: null, wired: null, fired: null, observed: null, certified: null },
      },
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
    // low confidence -> honest "STRUCTURE SCORE" headline, not "PROJECT HEALTH"
    expect(statusLines(state, score)[0]).toContain('VOID STRUCTURE SCORE  62/100   confidence: low');
    // with behavioral evidence (medium/high), it graduates to PROJECT HEALTH
    expect(statusLines(state, { ...score, confidence: 'high' })[0]).toContain('VOID PROJECT HEALTH   62/100');
  });

  it('adds the usage note only when Codex is the only runtime (usage unobservable)', () => {
    // state has claude detected -> usage observable -> no note
    expect(statusLines(state, score).join('\n')).not.toContain('not observable on Codex');
    // codex-only -> note
    const codexOnly: ProjectState = {
      ...state,
      runtimes: [{
        runtime: 'codex',
        detected: true,
        evidence: { installed: true, wired: true, fired: true, observed: false, certified: true },
      }],
    };
    expect(statusLines(codexOnly, score).join('\n')).toContain('not observable on Codex');
    // both claude + codex -> usage observable via Claude -> no note
    const both: ProjectState = {
      ...state,
      runtimes: [
        {
          runtime: 'claude',
          detected: true,
          evidence: { installed: true, wired: true, fired: true, observed: true, certified: true },
        },
        {
          runtime: 'codex',
          detected: true,
          evidence: { installed: true, wired: true, fired: true, observed: false, certified: true },
        },
      ],
    };
    expect(statusLines(both, score).join('\n')).not.toContain('not observable on Codex');
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
    expect(text).toContain('claude installed=yes wired=yes fired=yes observed=yes certified=yes');
    expect(text).toContain('hermes installed=unknown wired=unknown fired=unknown observed=unknown certified=unknown');
    expect(text).toContain('1. Evaluate critical capabilities');
  });

  it('marks a capped score with its blockers in the header', () => {
    const capped: Score = { ...score, capped: true, blockers: ['governance'], global: 69 };
    expect(statusLines(state, capped)[0]).toContain('(capped: governance)');
  });
});

describe('status from a linked worktree', () => {
  const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'void-harness.mjs');

  function git(cwd: string, ...args: string[]): void {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  }

  function runStatus(root: string): { code: number; out: string } {
    const result = spawnSync(process.execPath, [CLI, 'status'], {
      cwd: root,
      encoding: 'utf8',
    });
    return { code: result.status ?? 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  }

  // `.void/machine/` is per-repository state (decision of 2026-09-02): what
  // `status` measures is the installation, and where it persists the snapshot
  // must be where the installation is. Read from the tree it ran in, it
  // reported a worktree as an uninstalled project and left a `status.json`
  // there for the reconciler to delete.
  it('measures the installation and persists the snapshot in the main checkout', () => {
    const main = mkdtempSync(join(tmpdir(), 'status-main-'));
    mkdirSync(join(main, '.void'), { recursive: true });
    writeFileSync(join(main, '.void', 'config.json'), '{}\n');
    git(main, 'init', '--quiet');
    git(main, 'add', '.void/config.json');
    git(
      main,
      '-c', 'user.name=Void Test',
      '-c', 'user.email=void@example.test',
      'commit', '--quiet', '-m', 'test: seed',
    );
    const linked = join(mkdtempSync(join(tmpdir(), 'status-linked-')), 'DEV-000');
    git(main, 'worktree', 'add', '--quiet', linked, '-b', 'worker/DEV-000');

    const fromMain = runStatus(main);
    const fromWorktree = runStatus(linked);

    expect(fromMain.code).toBe(0);
    expect(fromWorktree.code).toBe(0);
    expect(existsSync(join(main, '.void', 'machine', 'status.json'))).toBe(true);
    expect(existsSync(join(linked, '.void', 'machine'))).toBe(false);
    expect(fromWorktree.out).toBe(fromMain.out);
  });
});
