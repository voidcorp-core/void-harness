import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileConfig } from './config.js';
import { buildFileConfig, hasConfig, wizardShouldRun, writeConfig } from './wizard.js';

describe('wizardShouldRun', () => {
  it('runs only when no config exists, at an interactive tty', () => {
    expect(wizardShouldRun(false, true, true)).toBe(true);
    expect(wizardShouldRun(true, true, true)).toBe(false); // config already there
    expect(wizardShouldRun(false, false, true)).toBe(false); // non-tty (CI)
    expect(wizardShouldRun(false, true, false)).toBe(false); // --no-interactive
  });
});

describe('buildFileConfig', () => {
  it('shapes answers into a FileConfig, omitting blanks', () => {
    expect(buildFileConfig({ scope: 'Team X', target: 'Ready', maxRaw: '5', autoMerge: true })).toEqual({
      linearScope: 'Team X',
      targetState: 'Ready',
      maxIterations: 5,
      autoMerge: true,
    });
  });

  it('omits a blank scope and an invalid max', () => {
    expect(buildFileConfig({ scope: '  ', target: '', maxRaw: 'lots', autoMerge: false })).toEqual({
      autoMerge: false,
    });
  });
});

describe('writeConfig / hasConfig', () => {
  it('writes a valid round-trippable config and is then detected', () => {
    const root = mkdtempSync(join(tmpdir(), 'bl-wiz-'));
    expect(hasConfig(root)).toBe(false);

    const config: FileConfig = { linearScope: 'Team X', targetState: 'Todo', maxIterations: 3, autoMerge: false };
    const path = writeConfig(root, config);

    expect(hasConfig(root)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(config);
  });
});
