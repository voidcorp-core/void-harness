import { execFile } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { parseDecision } from './parse.js';
import type {
  DecisionIssue,
  DecisionRecord,
} from './types.js';

const execFileAsync = promisify(execFile);
const SAFE_GIT_REF = /^(?!-)[A-Za-z0-9._/@{}^~+-]+$/;

export function isSafeGitRef(value: string): boolean {
  return SAFE_GIT_REF.test(value);
}

export type DecisionChange =
  | { readonly kind: 'modified'; readonly before: string }
  | { readonly kind: 'deleted'; readonly before: string }
  | {
      readonly kind: 'renamed';
      readonly before: string;
      readonly after: string;
    };

export function parseGitNameStatus(text: string): readonly DecisionChange[] {
  const changes: DecisionChange[] = [];
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const [status = '', before = '', after = ''] = line.split('\t');
    if ((status === 'M' || status === 'T') && before !== '') {
      changes.push({ kind: 'modified', before });
    } else if (status === 'D' && before !== '') {
      changes.push({ kind: 'deleted', before });
    } else if (status.startsWith('R') && before !== '' && after !== '') {
      changes.push({ kind: 'renamed', before, after });
    }
  }
  return changes;
}

export function immutableDecisionIssues(
  changes: readonly DecisionChange[],
  baseRecords: ReadonlyMap<string, DecisionRecord>,
): readonly DecisionIssue[] {
  const issues: DecisionIssue[] = [];
  for (const change of changes) {
    const record = baseRecords.get(change.before);
    if (record === undefined) {
      issues.push({
        code: 'git-check-failed',
        file: change.before,
        message: 'could not prove the base decision status; immutability check fails closed',
      });
      continue;
    }
    if (record.status === 'proposed') continue;
    const suffix = `; create a new decision that supersedes '${record.id}'`;
    if (change.kind === 'modified') {
      issues.push({
        code: 'accepted-decision-modified',
        file: change.before,
        message: `accepted decision files are immutable${suffix}`,
      });
    } else if (change.kind === 'deleted') {
      issues.push({
        code: 'accepted-decision-deleted',
        file: change.before,
        message: `accepted decision files cannot be deleted${suffix}`,
      });
    } else {
      issues.push({
        code: 'accepted-decision-renamed',
        file: change.before,
        message: `accepted decision files cannot be renamed${suffix}`,
      });
    }
  }
  return issues;
}

function slash(path: string): string {
  return path.split(sep).join('/');
}

async function recordAtBase(
  root: string,
  base: string,
  file: string,
): Promise<DecisionRecord | undefined> {
  try {
    const result = await execFileAsync('git', ['show', `${base}:${file}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
    const parsed = parseDecision(result.stdout, file);
    return parsed.ok ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

export async function checkDecisionImmutability(
  root: string,
  directory: string,
  base: string,
): Promise<readonly DecisionIssue[]> {
  if (!isSafeGitRef(base)) {
    return [{
      code: 'git-base-invalid',
      file: '(git)',
      message: `unsafe git base '${base}'`,
    }];
  }
  const relativeDirectory = slash(relative(resolve(root), resolve(directory)));
  try {
    const result = await execFileAsync(
      'git',
      ['diff', '--name-status', '--find-renames', base, '--', relativeDirectory],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const changes = parseGitNameStatus(result.stdout);
    const baseRecords = new Map<string, DecisionRecord>();
    for (const file of new Set(changes.map((change) => change.before))) {
      const record = await recordAtBase(root, base, file);
      if (record !== undefined) baseRecords.set(file, record);
    }
    return immutableDecisionIssues(changes, baseRecords);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{
      code: 'git-check-failed',
      file: '(git)',
      message: `could not compare decisions with '${base}': ${message}`,
    }];
  }
}
