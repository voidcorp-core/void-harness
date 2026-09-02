/**
 * The read that answers three things, and the verdict that acts on it.
 *
 * `readSettings` used to answer `{}` to a parse error, so a writer could not
 * tell an absent file from one it must not touch. The end-to-end proof lives in
 * `test/cli/unreadable-settings-is-not-empty.test.ts`, against a real install;
 * this pins the two pure pieces it rests on.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectSettings, readSettings, settingsWriteVerdict } from './settings.js';

function fileWith(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'void-settings-unit-')), 'settings.json');
  writeFileSync(path, content);
  return path;
}

describe('inspectSettings', () => {
  it('answers absent for a path with nothing at it', async () => {
    expect(await inspectSettings(join(tmpdir(), 'void-nothing-here', 'settings.json'))).toEqual({ kind: 'absent' });
  });

  it('answers unreadable for the trailing comma that breaks these files', async () => {
    expect(await inspectSettings(fileWith('{ "permissions": {}, }\n'))).toEqual({ kind: 'unreadable' });
  });

  it('hands back what the project wrote when it parses', async () => {
    const read = await inspectSettings(fileWith('{ "env": { "A": "1" } }\n'));

    expect(read.kind).toBe('present');
    expect(read.kind === 'present' && read.settings.env).toEqual({ A: '1' });
  });
});

describe('readSettings', () => {
  // Kept for readers that only report. A writer calling this is the defect.
  it('flattens both silences to empty, for callers that only report', async () => {
    expect(await readSettings(fileWith('{ "permissions": {}, }\n'))).toEqual({});
    expect(await readSettings(join(tmpdir(), 'void-nothing-here', 'settings.json'))).toEqual({});
  });
});

describe('settingsWriteVerdict', () => {
  it('scaffolds an absent file and merges a readable one, whatever force says', () => {
    for (const force of [false, true]) {
      expect(settingsWriteVerdict({ read: 'absent', force })).toBe('scaffold');
      expect(settingsWriteVerdict({ read: 'present', force })).toBe('merge');
    }
  });

  it('keeps an unreadable file, and only replaces it when asked in so many words', () => {
    expect(settingsWriteVerdict({ read: 'unreadable', force: false })).toBe('keep-unreadable');
    expect(settingsWriteVerdict({ read: 'unreadable', force: true })).toBe('overwrite-unreadable');
  });
});
