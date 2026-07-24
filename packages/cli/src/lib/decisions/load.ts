import type { Dirent } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import {
  detectDecisionsDirectory,
  resolvedPathIsWithinRoot,
} from './create.js';
import { parseDecision } from './parse.js';
import type {
  DecisionIssue,
  DecisionRecord,
  LoadedDecisions,
} from './types.js';

export const MAX_DECISION_BYTES = 256 * 1024;

function slash(path: string): string {
  return path.split(sep).join('/');
}

function errorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
  ) {
    return error.code;
  }
  return undefined;
}

export async function loadDecisions(root: string): Promise<LoadedDecisions> {
  const absoluteRoot = resolve(root);
  const directory = await detectDecisionsDirectory(absoluteRoot);
  try {
    if (!(await resolvedPathIsWithinRoot(absoluteRoot, directory))) {
      return {
        directory,
        records: [],
        issues: [{
          code: 'unsafe-decision-directory',
          file: slash(relative(absoluteRoot, directory)),
          message: 'decisions directory resolves outside the project root',
        }],
      };
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { directory, records: [], issues: [] };
    }
    throw error;
  }
  let entries: Dirent[];
  try {
    entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.name.endsWith('.md'))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { directory, records: [], issues: [] };
    }
    throw error;
  }

  const records: DecisionRecord[] = [];
  const issues: DecisionIssue[] = [];
  for (const entry of entries) {
    const name = entry.name;
    const absoluteFile = resolve(directory, name);
    const file = slash(relative(absoluteRoot, absoluteFile));
    if (!entry.isFile()) {
      issues.push({
        code: 'unsafe-decision-file',
        file,
        message: 'decision records must be regular files, not links or directories',
      });
      continue;
    }
    const content = await readFile(absoluteFile);
    if (content.byteLength > MAX_DECISION_BYTES) {
      issues.push({
        code: 'decision-file-too-large',
        file,
        message: `decision record exceeds ${MAX_DECISION_BYTES} bytes`,
      });
      continue;
    }
    const parsed = parseDecision(content.toString('utf8'), file);
    if (parsed.ok) records.push(parsed.value);
    else issues.push(...parsed.issues);
  }
  return { directory, records, issues };
}
