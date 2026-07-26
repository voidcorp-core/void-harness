import { describe, expect, it } from 'vitest';
import { redactArgv, redactOutput, redactText } from './redact.js';

describe('run evidence redaction', () => {
  const secrets = ['super-secret-token'];

  it('redacts known values, credentials and secret-shaped assignments', () => {
    const input =
      'Authorization: Bearer super-secret-token '
      + 'https://example.test?token=super-secret-token api_key=sk-live-1234567890';
    const redacted = redactText(input, secrets);

    expect(redacted).not.toContain('super-secret-token');
    expect(redacted).not.toContain('sk-live-1234567890');
    expect(redacted).toContain('[REDACTED]');
  });

  it('redacts high-confidence vendor tokens and private-key blocks', () => {
    const redacted = redactText(
      'AKIAABCDEFGHIJKLMNOP\n'
      + '-----BEGIN PRIVATE KEY-----\nprivate-material\n'
      + '-----END PRIVATE KEY-----',
      [],
    );

    expect(redacted).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(redacted).not.toContain('private-material');
  });

  it('redacts split and inline secret argv without changing safe arguments', () => {
    expect(
      redactArgv(
        ['deploy', '--token', 'super-secret-token', '--password=hunter2', '--dry-run'],
        secrets,
      ),
    ).toEqual([
      'deploy',
      '--token',
      '[REDACTED]',
      '--password=[REDACTED]',
      '--dry-run',
    ]);
  });

  it('bounds persisted output and reports truncation', () => {
    const output = redactOutput(
      `${'x'.repeat(10_000)}super-secret-token`,
      'safe',
      secrets,
    );

    expect(output.truncated).toBe(true);
    expect(output.stdout.length + output.stderr.length).toBeLessThanOrEqual(8_192);
    expect(JSON.stringify(output)).not.toContain('super-secret-token');
  });
});
