import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `back-merge.yml` was checked for tab characters and its shell body was checked
// with `bash -n`, and it still could not be parsed: a pull request body line sat
// at column zero, which ends a YAML block scalar. GitHub reported "a workflow
// file issue" and ran no job at all, on the first real release. Neither of the
// checks that were run could have seen it, because neither parsed the YAML.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

const files = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));

describe('workflow files', () => {
  it('has at least the workflows this repository runs on', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'release.yml', 'back-merge.yml', 'promotion.yml']));
  });

  // The structural trap, checked without a parser so it holds even where one is
  // unavailable: inside `run: |`, a line at column zero silently ends the block
  // and everything after it is read as top-level YAML.
  it.each(files)('%s keeps every body line indented under its block', (name) => {
    const lines = readFileSync(join(WORKFLOWS, name), 'utf8').split('\n');
    const offenders = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => line.length > 0 && !line.startsWith(' ') && !line.startsWith('#'))
      .filter(({ line }) => !/^[a-z][A-Za-z0-9_-]*:/.test(line));
    expect(offenders.map((offender) => `${name}:${String(offender.number)}`)).toEqual([]);
  });

  it.each(files)('%s contains no tab, which YAML forbids for indentation', (name) => {
    expect(readFileSync(join(WORKFLOWS, name), 'utf8')).not.toContain('\t');
  });
});
