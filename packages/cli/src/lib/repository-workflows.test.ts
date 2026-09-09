import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GITHUB = join(ROOT, '.github');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const files = readdirSync(WORKFLOWS).filter(
  (name) => name.endsWith('.yml') || name.endsWith('.yaml'),
);

type Permissions = Record<string, unknown> | 'read-all' | 'write-all';

type Workflow = {
  on?: Record<string, unknown>;
  permissions?: Permissions;
  jobs?: Record<
    string,
    {
      environment?: unknown;
      if?: unknown;
      needs?: string | readonly string[];
      permissions?: Permissions;
      'runs-on'?: unknown;
      uses?: unknown;
      steps?: Array<{ run?: unknown; uses?: unknown }>;
    }
  >;
};

function listYamlFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listYamlFiles(path);
    return entry.name.endsWith('.yml') || entry.name.endsWith('.yaml') ? [path] : [];
  });
}

function parseYaml(path: string): unknown {
  const document = parseDocument(readFileSync(path, 'utf8'), {
    strict: true,
    uniqueKeys: true,
  });
  expect(document.errors.map((error) => error.message), path).toEqual([]);
  return document.toJS();
}

function grantsOidcWrite(permissions: Permissions | undefined): boolean {
  return (
    permissions === 'write-all' ||
    (typeof permissions === 'object' && permissions?.['id-token'] === 'write')
  );
}

function parseWorkflow(name: string): Workflow {
  return parseYaml(join(WORKFLOWS, name)) as Workflow;
}

function needsOf(job: NonNullable<Workflow['jobs']>[string]): readonly string[] {
  if (typeof job.needs === 'string') return [job.needs];
  return job.needs ?? [];
}

function isMainGuarded(
  name: string,
  jobs: NonNullable<Workflow['jobs']>,
  visited = new Set<string>(),
): boolean {
  if (visited.has(name)) return false;
  visited.add(name);
  const job = jobs[name];
  if (job === undefined) return false;
  const condition = typeof job.if === 'string' ? job.if : '';
  if (/github\.ref\s*==\s*'refs\/heads\/main'/.test(condition)) return true;
  return needsOf(job).some(
    (dependency) =>
      condition.includes(`needs.${dependency}.result == 'success'`)
      && isMainGuarded(dependency, jobs, visited),
  );
}

describe('repository workflow execution contracts', () => {
  it.each(listYamlFiles(GITHUB))('%s parses as strict YAML', (path) => {
    expect(parseYaml(path)).toBeDefined();
  });

  it.each(files)('%s parses every run block as Bash', (name) => {
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

  it('pins every external action and reusable workflow to a full commit', () => {
    const references = files.flatMap((name) => {
      const workflow = parseWorkflow(name);
      return Object.values(workflow.jobs ?? {}).flatMap((job) => [
        job.uses,
        ...(job.steps ?? []).map((step) => step.uses),
      ]);
    });
    const floating = references.filter(
      (reference): reference is string =>
        typeof reference === 'string'
        && !reference.startsWith('./')
        && !/@[0-9a-f]{40}$/.test(reference),
    );

    expect(floating).toEqual([]);
  });

  it('uses the runner context only inside steps that run on an allocated runner', () => {
    const offenders = files.flatMap((name) => {
      const workflow = parseWorkflow(name);
      const { jobs = {}, ...workflowBeforeJobs } = workflow;
      const workflowOffenders = JSON.stringify(workflowBeforeJobs).includes('${{ runner.')
        ? [`${name}:workflow`]
        : [];
      return [
        ...workflowOffenders,
        ...Object.entries(jobs).flatMap(([jobName, job]) => {
          const { steps: _steps, ...beforeSteps } = job;
          return JSON.stringify(beforeSteps).includes('${{ runner.')
            ? [`${name}:${jobName}`]
            : [];
        }),
      ];
    });

    expect(offenders).toEqual([]);
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
    const publishingWorkflow = workflows.find(({ name }) => name === oidcJobs[0]?.name)?.workflow;
    expect(isMainGuarded(oidcJobs[0]?.jobName ?? '', publishingWorkflow?.jobs ?? {})).toBe(true);
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
