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
const GITHUB = join(ROOT, '.github');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

function listYamlFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listYamlFiles(path);
    return entry.name.endsWith('.yml') || entry.name.endsWith('.yaml') ? [path] : [];
  });
}

const files = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
const githubYamlFiles = listYamlFiles(GITHUB);

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

  it.each(githubYamlFiles)(
    '%s pins every external action and reusable workflow to a full SHA',
    (name) => {
      const used = [
        ...readFileSync(name, 'utf8').matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm),
      ].map((match) => match[1] ?? '');
      const floating = used.filter(
        (reference) => !reference.startsWith('./') && !/@[0-9a-f]{40}$/.test(reference),
      );

      expect(floating).toEqual([]);
    },
  );
});

// A job holding `id-token: write` can mint the OIDC token npm accepts as proof
// of identity. npm cannot help here: its trusted publisher matches organisation,
// repository, workflow FILENAME and an optional environment -- there is no branch
// or ref field, so every run of this file looks legitimate to the registry
// (verified against the npm docs and the package settings, 2026-08-20). The
// restriction therefore has to exist in the workflow, and these tests are what
// keeps it there.
describe('workflows that can publish', () => {
  const publishing = files.filter((name) => readFileSync(join(WORKFLOWS, name), 'utf8').includes('id-token: write'));

  it('names at least release.yml, or these tests guard nothing', () => {
    expect(publishing).toContain('release.yml');
  });

  it.each(publishing)('%s refuses to publish from a ref other than main', (name) => {
    const body = readFileSync(join(WORKFLOWS, name), 'utf8');
    // A manual dispatch carries the ref it was fired from. Without this guard the
    // job checks out that ref and publishes it under the package name, signed.
    expect(body).toMatch(/github\.ref\s*==\s*'refs\/heads\/main'/);
  });

  it.each(publishing)('%s gates the publishing job behind a protected environment', (name) => {
    // The ONLY restriction npm can enforce beyond the workflow filename. Without
    // it, a modified copy of this file on any branch publishes just as validly.
    expect(readFileSync(join(WORKFLOWS, name), 'utf8')).toMatch(/^\s+environment:\s*\S+/m);
  });
});
