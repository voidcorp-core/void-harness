import { describe, expect, it } from 'vitest';
import { normalizeScannerOutput } from './findings.js';

const SEMGREP = JSON.stringify({
  results: [
    {
      check_id: 'javascript.lang.security.sql-string-concat',
      path: 'src/db/users.js',
      start: { line: 14 },
      extra: { message: 'SQL built by concatenation', severity: 'ERROR' },
    },
  ],
});

const GITLEAKS = JSON.stringify([
  {
    RuleID: 'aws-access-token',
    File: 'src/config.ts',
    StartLine: 7,
    Description: 'AWS Access Token',
    Secret: 'AKIAIOSFODNN7EXAMPLE',
    Match: 'const key = "AKIAIOSFODNN7EXAMPLE"',
  },
]);

const OSV = JSON.stringify({
  results: [
    {
      packages: [
        {
          package: { name: 'lodash', ecosystem: 'npm', version: '4.17.20' },
          vulnerabilities: [{ id: 'GHSA-xxxx', summary: 'Prototype pollution' }],
        },
      ],
    },
  ],
});

const ZAP = JSON.stringify({
  site: [
    {
      '@name': 'https://staging.example.com',
      alerts: [
        { alertRef: '10038', name: 'Content Security Policy Header Not Set', riskcode: '2', desc: 'No CSP.' },
      ],
    },
  ],
});

describe('semgrep output', () => {
  it('becomes a finding with its file, line and rule', () => {
    const { findings } = normalizeScannerOutput('semgrep', SEMGREP);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe('src/db/users.js');
    expect(findings[0]?.line).toBe(14);
    expect(findings[0]?.rule).toContain('sql-string-concat');
  });

  it('maps ERROR to high, so the class floor can still raise it', () => {
    expect(normalizeScannerOutput('semgrep', SEMGREP).findings[0]?.reportedSeverity).toBe('high');
  });

  it('carries a reproduction a reader can act on', () => {
    const finding = normalizeScannerOutput('semgrep', SEMGREP).findings[0];

    expect(finding?.reproduction).toContain('src/db/users.js');
    expect(finding?.reproduction).toContain('14');
  });

  it('classifies an unrecognised rule as unknown rather than guessing', () => {
    // `unknown` carries a medium floor. Filing a rule we cannot read under a
    // specific class would be inventing a severity from a string match.
    const output = JSON.stringify({
      results: [{ check_id: 'some.custom.rule', path: 'a.js', start: { line: 1 }, extra: { severity: 'INFO' } }],
    });

    expect(normalizeScannerOutput('semgrep', output).findings[0]?.securityClass).toBe('unknown');
  });
});

describe('gitleaks output', () => {
  it('never carries the secret it found', () => {
    // A findings report that quotes the credential is a second place the
    // credential now lives, and this one gets pasted into tickets.
    const { findings } = normalizeScannerOutput('gitleaks', GITLEAKS);
    const serialized = JSON.stringify(findings);

    expect(serialized).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(findings[0]?.file).toBe('src/config.ts');
    expect(findings[0]?.line).toBe(7);
  });

  it('is a secret-exposure, which the engine refuses to waive', () => {
    expect(normalizeScannerOutput('gitleaks', GITLEAKS).findings[0]?.securityClass).toBe('secret-exposure');
  });

  it('says to rotate, because deleting the line does not un-leak it', () => {
    expect(normalizeScannerOutput('gitleaks', GITLEAKS).findings[0]?.remediation).toMatch(/rotate/i);
  });
});

describe('osv-scanner output', () => {
  it('names the package and the advisory', () => {
    const finding = normalizeScannerOutput('osv-scanner', OSV).findings[0];

    expect(finding?.securityClass).toBe('dependency');
    expect(finding?.rule).toContain('GHSA-xxxx');
    expect(finding?.summary).toContain('lodash');
  });
});

describe('zap output', () => {
  it('reads the alert and its risk level', () => {
    const finding = normalizeScannerOutput('zap-baseline', ZAP).findings[0];

    expect(finding?.securityClass).toBe('misconfiguration');
    expect(finding?.reportedSeverity).toBe('medium');
    expect(finding?.summary).toContain('Content Security Policy');
  });
});

describe('output the harness cannot read', () => {
  it('is unreadable rather than empty, because empty reads as clean', () => {
    // The distinction that matters: a scanner that found nothing and a scanner
    // whose output we failed to parse produce the same empty list, and only one
    // of them means the code is fine.
    const result = normalizeScannerOutput('semgrep', 'not json at all');

    expect(result.unreadable).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('treats a valid JSON of the wrong shape as unreadable too', () => {
    expect(normalizeScannerOutput('semgrep', '{"unexpected": true}').unreadable).toBe(true);
  });

  it('reads an empty result set as genuinely empty', () => {
    const result = normalizeScannerOutput('semgrep', JSON.stringify({ results: [] }));

    expect(result.unreadable).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it('refuses an output larger than its ceiling instead of parsing it', () => {
    const huge = `{"results":[${'{"check_id":"x","path":"a","start":{"line":1},"extra":{}},'.repeat(200_000)}]}`;

    expect(normalizeScannerOutput('semgrep', huge).unreadable).toBe(true);
  });

  it('is unreadable for an adapter it does not know how to read', () => {
    // A project can add its own adapter. Until a normaliser exists for it, its
    // output is unmeasured surface, not a clean bill of health.
    expect(normalizeScannerOutput('some-custom-scanner', '{}').unreadable).toBe(true);
  });
});
