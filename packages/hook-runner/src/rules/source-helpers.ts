import type {
  NormalizedEdit,
  RuleVerdict,
} from '../enforcement/types.js';
import { allow, block } from './verdict.js';

export function normalizedPath(path: string): string {
  return path.replaceAll('\\', '/');
}

export function isTestPath(path: string): boolean {
  return /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(path);
}

export function isGeneratedPath(path: string): boolean {
  return /\/__(?:generated|fixtures)__\//.test(path);
}

export function lineEvidence(
  edits: readonly NormalizedEdit[],
  applies: (path: string) => boolean,
  violates: (line: string) => boolean,
  allowTag?: string,
): string[] {
  const evidence: string[] = [];
  for (const edit of edits) {
    const path = normalizedPath(edit.path);
    if (!applies(path)) continue;
    edit.addedContent.split(/\r?\n/).forEach((line, index) => {
      if (allowTag !== undefined && line.includes(allowTag)) return;
      if (violates(line)) evidence.push(`${path}:${index + 1}`);
    });
  }
  return evidence;
}

export function evidenceVerdict(
  code: string,
  message: string,
  evidence: readonly string[],
): RuleVerdict {
  return evidence.length === 0 ? allow() : block(code, message, evidence);
}
