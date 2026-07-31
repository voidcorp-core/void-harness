import { describe, expect, it } from 'vitest';
import type { ScopeAuthorization } from '@voidcorp/mission-engine';
import { parseSecurityManifestYaml, type SecurityManifest } from './manifest.js';
import { planSecurityScan } from './plan.js';

const NOW = '2026-07-31T12:00:00.000Z';

const MANIFEST: SecurityManifest = parseSecurityManifestYaml(
  `schemaVersion: 1
adapters:
  - id: semgrep
    kind: sast
    description: static analysis
    command: semgrep
    args: [--json]
    versionArgs: [--version]
    reach: none
    provides: [static-analysis]
    limits: {timeoutSeconds: 60, maxOutputBytes: 1024}
    exitCodes: {clean: [0], findings: [1]}
  - id: osv
    kind: dependency
    description: dependency audit
    command: osv-scanner
    args: [--json]
    versionArgs: [--version]
    reach: advisory-service
    provides: [dependency-audit]
    limits: {timeoutSeconds: 60, maxOutputBytes: 1024}
    exitCodes: {clean: [0], findings: [1]}
  - id: zap
    kind: dast
    description: passive baseline
    command: zap-baseline.py
    args: [-I]
    versionArgs: [-h]
    targetFlag: -t
    reach: authorized-target
    provides: [dast-baseline]
    limits: {timeoutSeconds: 60, maxOutputBytes: 1024}
    exitCodes: {clean: [0], findings: [1]}
`,
  'test.yaml',
);

const GRANT: ScopeAuthorization = {
  hosts: ['staging.example.com'],
  authorizedBy: 'folpe',
  authorizedAt: '2026-07-31T10:00:00.000Z',
  expiresAt: '2026-07-31T18:00:00.000Z',
  destructive: false,
  ephemeralTarget: true,
};

function plan(overrides: Partial<Parameters<typeof planSecurityScan>[0]> = {}) {
  return planSecurityScan({
    manifest: MANIFEST,
    posture: { mode: 'team', prelaunch: false },
    available: ['semgrep', 'osv', 'zap'],
    authorization: null,
    allowNetwork: true,
    now: NOW,
    ...overrides,
  });
}

describe('an external target without authorization', () => {
  it('is refused', () => {
    const result = plan({ target: 'https://staging.example.com' });

    expect(result.kind).toBe('refused');
    if (result.kind === 'refused') expect(result.reason).toBe('no-authorization');
  });

  it('refuses the whole run rather than quietly scanning something else', () => {
    // The operator asked about a target. Running the static analysers anyway
    // and reporting a verdict would answer a question nobody asked, under a
    // heading that reads like the one they did ask.
    const result = plan({ target: 'https://staging.example.com' });

    expect(result.kind).toBe('refused');
  });

  it('is refused when the grant names a different host', () => {
    const result = plan({ target: 'https://prod.example.com', authorization: GRANT });

    expect(result.kind).toBe('refused');
    if (result.kind === 'refused') expect(result.reason).toBe('host-not-authorized');
  });

  it('is refused once the grant has expired', () => {
    const result = plan({
      target: 'https://staging.example.com',
      authorization: GRANT,
      now: '2026-08-01T00:00:00.000Z',
    });

    expect(result.kind).toBe('refused');
    if (result.kind === 'refused') expect(result.reason).toBe('authorization-expired');
  });

  it('runs the DAST adapter once the grant covers the host', () => {
    const result = plan({ target: 'https://staging.example.com', authorization: GRANT });

    expect(result.kind).toBe('planned');
    if (result.kind === 'planned') {
      expect(result.run.map((entry) => entry.adapter.id)).toContain('zap');
    }
  });
});

describe('without a target', () => {
  it('runs the local scanners and does not invent one for the DAST adapter', () => {
    const result = plan();

    expect(result.kind).toBe('planned');
    if (result.kind === 'planned') {
      expect(result.run.map((entry) => entry.adapter.id)).toEqual(['semgrep', 'osv']);
      expect(result.skipped.find((entry) => entry.id === 'zap')?.reason).toBe('no-target');
    }
  });
});

describe('a tool that is not installed', () => {
  it('is named as missing rather than passed over in silence', () => {
    const result = plan({ available: ['semgrep'] });

    expect(result.kind).toBe('planned');
    if (result.kind === 'planned') {
      expect(result.missingTools).toContain('osv-scanner');
      expect(result.run.map((entry) => entry.adapter.id)).toEqual(['semgrep']);
    }
  });

  it('reports missing tools by command name, since that is what the operator installs', () => {
    const result = plan({ available: [] });

    expect(result.kind).toBe('planned');
    if (result.kind === 'planned') expect(result.missingTools).toContain('semgrep');
  });
});

describe('an offline run', () => {
  it('refuses to let a scanner reach an advisory service', () => {
    const result = plan({ allowNetwork: false });

    expect(result.kind).toBe('planned');
    if (result.kind === 'planned') {
      expect(result.run.map((entry) => entry.adapter.id)).toEqual(['semgrep']);
      expect(result.skipped.find((entry) => entry.id === 'osv')?.reason).toBe('network-refused');
    }
  });

  it('counts a scanner it refused to run as unmeasured surface, not as a pass', () => {
    // Skipping for a good reason still leaves the surface unmeasured. If that
    // did not surface as a missing tool, an offline run would look identical to
    // a complete one.
    const result = plan({ allowNetwork: false });

    if (result.kind === 'planned') expect(result.missingTools).toContain('osv-scanner');
  });
});

describe('the non-destructive default', () => {
  const mutating = parseSecurityManifestYaml(
    `schemaVersion: 1
adapters:
  - id: zap-full
    kind: dast
    description: active scan
    command: zap-full-scan.py
    args: [-I]
    versionArgs: [-h]
    targetFlag: -t
    reach: authorized-target
    mutates: true
    provides: [dast-active]
    limits: {timeoutSeconds: 60, maxOutputBytes: 1024}
    exitCodes: {clean: [0], findings: [1]}
`,
    'mutating.yaml',
  );

  it('refuses a mutating scanner against a grant that did not authorize writes', () => {
    const result = plan({
      manifest: mutating,
      available: ['zap-full'],
      target: 'https://staging.example.com',
      authorization: GRANT,
    });

    expect(result.kind).toBe('planned');
    if (result.kind === 'planned') {
      expect(result.run).toHaveLength(0);
      expect(result.skipped[0]?.reason).toBe('destructive-not-authorized');
    }
  });

  it('runs it when the grant explicitly authorizes destructive probes', () => {
    const result = plan({
      manifest: mutating,
      available: ['zap-full'],
      target: 'https://staging.example.com',
      authorization: { ...GRANT, destructive: true },
    });

    expect(result.kind).toBe('planned');
    if (result.kind === 'planned') expect(result.run).toHaveLength(1);
  });

  it('still refuses a mutating scanner on a shared target, whatever the grant says', () => {
    // `ephemeralTarget: false` is a target real users are on. A grant to write
    // to it is a grant somebody should not have given.
    const result = plan({
      manifest: mutating,
      available: ['zap-full'],
      target: 'https://staging.example.com',
      authorization: { ...GRANT, destructive: true, ephemeralTarget: false },
    });

    expect(result.kind).toBe('refused');
  });
});

describe('the plan carries what the run needs and nothing more', () => {
  it('places the target behind the flag the adapter named, never inside the manifest args', () => {
    const result = plan({ target: 'https://staging.example.com', authorization: GRANT });

    if (result.kind === 'planned') {
      const zap = result.run.find((entry) => entry.adapter.id === 'zap');

      expect(zap?.argv).toEqual(['-I', '-t', 'https://staging.example.com']);
    }
  });

  it('leaves the argv of a local scanner exactly as the manifest declared it', () => {
    const result = plan();

    if (result.kind === 'planned') {
      expect(result.run.find((entry) => entry.adapter.id === 'semgrep')?.argv).toEqual(['--json']);
    }
  });

  it('sends a report to the flag the adapter named, when a report directory is given', () => {
    const reporting = parseSecurityManifestYaml(
      `schemaVersion: 1
adapters:
  - id: gitleaks
    kind: secrets
    description: secret scan
    command: gitleaks
    args: [dir]
    versionArgs: [version]
    outputFlag: --report-path
    reach: none
    provides: [secret-scan]
    limits: {timeoutSeconds: 60, maxOutputBytes: 1024}
    exitCodes: {clean: [0], findings: [1]}
`,
      'reporting.yaml',
    );
    const result = plan({ manifest: reporting, available: ['gitleaks'], reportDir: '/tmp/reports' });

    if (result.kind === 'planned') {
      expect(result.run[0]?.argv).toEqual(['dir', '--report-path', '/tmp/reports/gitleaks.json']);
      expect(result.run[0]?.reportPath).toBe('/tmp/reports/gitleaks.json');
    }
  });

  it('adds no report flag when no report directory was given', () => {
    const result = plan();

    if (result.kind === 'planned') {
      for (const entry of result.run) expect(entry.reportPath).toBeUndefined();
    }
  });
});
