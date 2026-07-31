import { describe, expect, it } from 'vitest';
import { parseSecurityManifestYaml } from './manifest.js';

const PATH = 'adapters/security/manifest.yaml';

function manifest(body: string) {
  return parseSecurityManifestYaml(body, PATH);
}

function adapter(overrides: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    id: 'semgrep',
    kind: 'sast',
    description: 'Pattern-based static analysis over the working tree.',
    command: 'semgrep',
    args: ['--config', 'auto', '--json'],
    versionArgs: ['--version'],
    reach: 'none',
    provides: ['static-analysis'],
    limits: { timeoutSeconds: 300, maxOutputBytes: 4_194_304 },
    exitCodes: { clean: [0], findings: [1] },
    ...overrides,
  };
  const lines = Object.entries(base).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`);
  return `schemaVersion: 1\nadapters:\n  -\n${lines.join('\n')}\n`;
}

describe('a well-formed manifest', () => {
  it('parses an adapter that stays inside the working tree', () => {
    const parsed = manifest(adapter());

    expect(parsed.adapters).toHaveLength(1);
    expect(parsed.adapters[0]?.command).toBe('semgrep');
    expect(parsed.adapters[0]?.reach).toBe('none');
  });

  it('accepts a DAST adapter that declares it needs an authorized target', () => {
    const parsed = manifest(
      adapter({ id: 'zap', kind: 'dast', reach: 'authorized-target', targetFlag: '-t' }),
    );

    expect(parsed.adapters[0]?.reach).toBe('authorized-target');
    expect(parsed.adapters[0]?.targetFlag).toBe('-t');
  });
});

describe('the target lives outside the manifest', () => {
  // Only the flag is described. The URL comes from an authorization checked at
  // run time, so editing this file can never widen what gets scanned.
  it('refuses a DAST adapter that does not say which flag carries its target', () => {
    expect(() => manifest(adapter({ id: 'zap', kind: 'dast', reach: 'authorized-target' }))).toThrow(
      /targetFlag/i,
    );
  });

  it('refuses a target flag on a tool that reaches nothing', () => {
    expect(() => manifest(adapter({ targetFlag: '-t' }))).toThrow(/targetFlag/i);
  });

  it('refuses a target flag that could compose a command', () => {
    expect(() =>
      manifest(adapter({ id: 'zap', kind: 'dast', reach: 'authorized-target', targetFlag: '-t;id' })),
    ).toThrow(/metacharacter/i);
  });
});

describe('the command is a bare binary name, never a composed one', () => {
  // The manifest names a tool; it does not get to build a command line. A
  // manifest is third-party input, and anything that reaches a shell from
  // untrusted input is an execution primitive rather than a description.
  it('refuses a path, so no adapter can point at a binary it shipped itself', () => {
    expect(() => manifest(adapter({ command: './tools/scan.sh' }))).toThrow(/command/i);
    expect(() => manifest(adapter({ command: '/usr/local/bin/scan' }))).toThrow(/command/i);
  });

  it('refuses traversal in the command name', () => {
    expect(() => manifest(adapter({ command: '../scan' }))).toThrow(/command/i);
  });

  it('refuses shell metacharacters in the command name', () => {
    for (const command of ['scan; rm -rf /', 'scan && curl x', 'scan | tee', 'sh -c scan']) {
      expect(() => manifest(adapter({ command })), command).toThrow(/command/i);
    }
  });

  it('refuses an argument that could compose a second command', () => {
    for (const argument of ['$(id)', '`id`', 'a; id', 'a && id', 'a | id', 'a\nid', 'a > /etc/passwd']) {
      expect(() => manifest(adapter({ args: [argument] })), argument).toThrow(/arg/i);
    }
  });
});

describe('an adapter describes what it does; it never decides its own verdict', () => {
  // Severity and blocking are decided by the engine from the finding class. An
  // adapter that could declare itself non-blocking would be a scanner grading
  // its own paper.
  it('rejects a verdict field', () => {
    expect(() => manifest(adapter({ verdict: 'green' }))).toThrow(/verdict/i);
  });

  it('rejects a severity field', () => {
    expect(() => manifest(adapter({ severity: 'low' }))).toThrow(/severity/i);
  });

  it('rejects a waivable field', () => {
    expect(() => manifest(adapter({ waivable: true }))).toThrow(/waivable/i);
  });
});

describe('nothing is installed or run by describing it', () => {
  // Reading a manifest must be inert. An `install` hook would mean that adding
  // a scanner to a list executes code on every machine that reads the list.
  it('rejects an install field', () => {
    expect(() => manifest(adapter({ install: 'npm i -g semgrep' }))).toThrow(/install/i);
  });

  it('rejects a postinstall field', () => {
    expect(() => manifest(adapter({ postinstall: './setup.sh' }))).toThrow(/postinstall/i);
  });

  it('rejects an unknown field rather than ignoring it', () => {
    expect(() => manifest(adapter({ shell: true }))).toThrow(/shell/i);
  });
});

describe('reach is tied to the kind, because a scanner that talks to a host is a different animal', () => {
  it('refuses a static analyser that claims an authorized target', () => {
    // A SAST tool reads files. If it reaches a host, either the kind is wrong
    // or the reach is, and guessing which would be guessing about the network.
    expect(() => manifest(adapter({ kind: 'sast', reach: 'authorized-target' }))).toThrow(/reach|kind/i);
  });

  it('refuses a DAST adapter that claims to reach nothing', () => {
    expect(() => manifest(adapter({ id: 'zap', kind: 'dast', reach: 'none' }))).toThrow(/reach|kind/i);
  });

  it('allows a dependency scanner to reach localhost for a registry mirror', () => {
    const parsed = manifest(adapter({ id: 'osv', kind: 'dependency', reach: 'localhost' }));

    expect(parsed.adapters[0]?.reach).toBe('localhost');
  });

  it('lets a dependency scanner query an advisory service without a pentest authorization', () => {
    // Asking a vulnerability database what it knows is egress, but it is not a
    // target under test. Filing it under `authorized-target` would make the
    // authorization gate routine, and a gate that fires on every run stops
    // being read.
    const parsed = manifest(adapter({ id: 'osv', kind: 'dependency', reach: 'advisory-service' }));

    expect(parsed.adapters[0]?.reach).toBe('advisory-service');
  });

  it('refuses an advisory-service reach for a tool that only reads files', () => {
    expect(() => manifest(adapter({ kind: 'secrets', reach: 'advisory-service' }))).toThrow(/reach/i);
  });
});

describe('every adapter is bounded', () => {
  it('requires limits', () => {
    expect(() => manifest(adapter({ limits: undefined }))).toThrow(/limits/i);
  });

  it('refuses a timeout above the ceiling, since an unbounded scan blocks a run forever', () => {
    expect(() => manifest(adapter({ limits: { timeoutSeconds: 100_000, maxOutputBytes: 1024 } }))).toThrow(
      /timeoutSeconds/i,
    );
  });

  it('refuses an output ceiling large enough to exhaust memory', () => {
    expect(() =>
      manifest(adapter({ limits: { timeoutSeconds: 60, maxOutputBytes: 1_073_741_824 } })),
    ).toThrow(/maxOutputBytes/i);
  });

  it('refuses a zero timeout, which would describe a scan that cannot run', () => {
    expect(() => manifest(adapter({ limits: { timeoutSeconds: 0, maxOutputBytes: 1024 } }))).toThrow(
      /timeoutSeconds/i,
    );
  });
});

describe('the file itself is untrusted input', () => {
  it('refuses a duplicate adapter id', () => {
    const body = `${adapter()}${adapter().replace(/^schemaVersion: 1\nadapters:\n/, '')}`;

    expect(() => manifest(body)).toThrow(/duplicate/i);
  });

  it('refuses YAML anchors, which are how a small file becomes a huge one', () => {
    const body = [
      'schemaVersion: 1',
      'adapters:',
      '  - &a',
      '    id: semgrep',
      '    kind: sast',
      '    description: x',
      '    command: semgrep',
      '    args: []',
      '    versionArgs: ["--version"]',
      '    reach: none',
      '    provides: [static-analysis]',
      '    limits: {timeoutSeconds: 60, maxOutputBytes: 1024}',
      '    exitCodes: {clean: [0], findings: [1]}',
      '  - *a',
      '',
    ].join('\n');

    expect(() => manifest(body)).toThrow(/alias|anchor|SECURITY_MANIFEST/i);
  });

  it('refuses a duplicate key rather than silently keeping the last one', () => {
    expect(() => manifest(adapter().replace('    kind: "sast"', '    kind: "sast"\n    kind: "dast"'))).toThrow(
      /duplicate|key/i,
    );
  });

  it('refuses a file over its byte ceiling', () => {
    const padded = `${adapter()}# ${'x'.repeat(70_000)}\n`;

    expect(() => manifest(padded)).toThrow(/exceeds/i);
  });

  it('refuses a manifest that declares no adapter, which would silently scan nothing', () => {
    expect(() => manifest('schemaVersion: 1\nadapters: []\n')).toThrow(/adapters/i);
  });

  it('refuses an unknown schema version instead of guessing the shape', () => {
    expect(() => manifest(adapter().replace('schemaVersion: 1', 'schemaVersion: 2'))).toThrow(
      /schemaVersion/i,
    );
  });

  it('names the file in every failure, so a broken manifest is findable', () => {
    expect(() => manifest('adapters: nope\n')).toThrow(new RegExp(PATH));
  });
});
