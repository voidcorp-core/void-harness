import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const files = readdirSync(WORKFLOWS).filter(
  (name) => name.endsWith('.yml') || name.endsWith('.yaml'),
);

type Permissions = Record<string, unknown> | 'read-all' | 'write-all';

type Workflow = {
  permissions?: Permissions;
  jobs?: Record<
    string,
    {
      environment?: unknown;
      permissions?: Permissions;
      steps?: Array<{ run?: unknown }>;
    }
  >;
};

function grantsOidcWrite(permissions: Permissions | undefined): boolean {
  return (
    permissions === 'write-all' ||
    (typeof permissions === 'object' && permissions?.['id-token'] === 'write')
  );
}

function parseWorkflow(name: string): Workflow {
  const document = parseDocument(readFileSync(join(WORKFLOWS, name), 'utf8'), {
    strict: true,
    uniqueKeys: true,
  });
  expect(document.errors.map((error) => error.message), name).toEqual([]);
  return document.toJS() as Workflow;
}

describe('repository workflow execution contracts', () => {
  it.each(files)('%s parses as strict YAML and every run block parses as Bash', (name) => {
    const workflow = parseWorkflow(name);
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      for (const [stepIndex, step] of (job.steps ?? []).entries()) {
        if (typeof step.run !== 'string') continue;
        const shell = step.run.replace(/\$\{\{[^\n]*?\}\}/g, 'GITHUB_EXPRESSION');
        const result = spawnSync('bash', ['-n'], { input: shell, encoding: 'utf8' });
        expect(result.status, `${name}:${jobName}:step-${stepIndex + 1}\n${result.stderr}`).toBe(
          0,
        );
        for (const [programIndex, match] of [
          ...step.run.matchAll(/node[^\n]*<<'NODE'\n([\s\S]*?)\nNODE/g),
        ].entries()) {
          const node = spawnSync(process.execPath, ['--check', '--input-type=module'], {
            input: match[1],
            encoding: 'utf8',
          });
          expect(
            node.status,
            `${name}:${jobName}:step-${stepIndex + 1}:node-${programIndex + 1}\n${node.stderr}`,
          ).toBe(0);
        }
      }
    }
  });

  it('grants OIDC to exactly release.yml/publish with the bounded job contract', () => {
    const workflows = files.map((name) => ({ name, workflow: parseWorkflow(name) }));
    expect(workflows.filter(({ workflow }) => grantsOidcWrite(workflow.permissions))).toEqual([]);
    const oidcJobs = workflows.flatMap(({ name, workflow }) =>
      Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) => {
        const effectivePermissions = job.permissions ?? workflow.permissions ?? {};
        return grantsOidcWrite(effectivePermissions) ? [{ name, jobName, job }] : [];
      }),
    );

    expect(oidcJobs.map(({ name, jobName }) => ({ name, jobName }))).toEqual([
      { name: 'release.yml', jobName: 'publish' },
    ]);
    expect(oidcJobs[0]?.job.permissions).toEqual({
      contents: 'read',
      actions: 'read',
      'id-token': 'write',
    });
    expect(oidcJobs[0]?.job.environment).toBe('npm-publish');
  });

  it('treats workflow-level and job-level write-all as effective OIDC write authority', () => {
    const workflowLevel = parseDocument(
      'permissions: write-all\njobs:\n  inherited:\n    runs-on: ubuntu-latest\n',
    ).toJS() as Workflow;
    const jobLevel = parseDocument(
      'permissions: read-all\njobs:\n  explicit:\n    runs-on: ubuntu-latest\n    permissions: write-all\n',
    ).toJS() as Workflow;

    expect(grantsOidcWrite(workflowLevel.permissions)).toBe(true);
    expect(
      grantsOidcWrite(
        workflowLevel.jobs?.inherited?.permissions ?? workflowLevel.permissions,
      ),
    ).toBe(true);
    expect(grantsOidcWrite(jobLevel.jobs?.explicit?.permissions)).toBe(true);
    expect(grantsOidcWrite('read-all')).toBe(false);
    expect(grantsOidcWrite({ 'id-token': 'write' })).toBe(true);
    expect(grantsOidcWrite({ contents: 'write' })).toBe(false);
  });
});
