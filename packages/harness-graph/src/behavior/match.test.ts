import { describe, expect, it } from 'vitest';
import { globMatches, triggerMatches } from './match.js';

describe('globMatches', () => {
  it('matches ** across directories and * within a segment', () => {
    expect(globMatches('**/*.test.ts', 'src/render/a.test.ts')).toBe(true);
    expect(globMatches('**/*.test.ts', 'a.test.ts')).toBe(true);
    expect(globMatches('**/*.test.ts', 'src/a.ts')).toBe(false);
  });

  it('matches a directory anywhere via **/dir/**', () => {
    expect(globMatches('**/migrations/**', 'packages/db/migrations/001.sql')).toBe(true);
    expect(globMatches('**/migrations/**', 'packages/db/seed.sql')).toBe(false);
  });

  it('keeps * within a single segment', () => {
    expect(globMatches('*.sql', 'a.sql')).toBe(true);
    expect(globMatches('*.sql', 'dir/a.sql')).toBe(false);
  });
});

describe('triggerMatches', () => {
  const sit = (over: Partial<{ tool: string; ext: string[]; fileGlobs: string[] }>) => ({
    tool: over.tool ?? '',
    ext: over.ext ?? [],
    fileGlobs: over.fileGlobs ?? [],
  });

  it('matches when the tool is declared', () => {
    expect(triggerMatches({ tools: ['Edit'] }, sit({ tool: 'Edit' }))).toBe(true);
    expect(triggerMatches({ tools: ['Edit'] }, sit({ tool: 'Bash' }))).toBe(false);
  });

  it('matches when an extension is declared', () => {
    expect(triggerMatches({ extensions: ['sql'] }, sit({ ext: ['sql'] }))).toBe(true);
    expect(triggerMatches({ extensions: ['sql'] }, sit({ ext: ['ts'] }))).toBe(false);
  });

  it('matches when a glob hits a file path', () => {
    expect(triggerMatches({ globs: ['**/*.test.ts'] }, sit({ fileGlobs: ['src/a.test.ts'] }))).toBe(true);
    expect(triggerMatches({ globs: ['**/*.test.ts'] }, sit({ fileGlobs: ['src/a.ts'] }))).toBe(false);
  });

  it('is OR across declared dimensions and false on an empty trigger', () => {
    expect(triggerMatches({ tools: ['Edit'], extensions: ['sql'] }, sit({ ext: ['sql'] }))).toBe(true);
    expect(triggerMatches({}, sit({ tool: 'Edit', ext: ['ts'], fileGlobs: ['a.ts'] }))).toBe(false);
  });
});
