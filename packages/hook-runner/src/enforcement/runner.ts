import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import type {
  NormalizedEdit,
  RuleVerdict,
} from './types.js';
import { normalizeToolCall } from './normalize.js';
import { dangerousCommand } from '../rules/dangerous-command.js';
import { protectedFile } from '../rules/protected-file.js';
import { secretContent } from '../rules/secret-content.js';
import {
  tddOrder,
  type TddMode,
} from '../rules/tdd-order.js';
import { allow } from '../rules/verdict.js';

export const MAX_HOOK_INPUT_BYTES = 1024 * 1024;

export type RuleName =
  | 'dangerous-command'
  | 'protected-file'
  | 'secret-content'
  | 'tdd-order';

export interface EvaluateRuleOptions {
  readonly root: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function containsNul(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('\u0000');
  if (Array.isArray(value)) return value.some((item) => containsNul(item));
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value).some((item) => containsNul(item));
}

export function parseHookText(input: Uint8Array): string {
  if (input.byteLength > MAX_HOOK_INPUT_BYTES) {
    throw new Error('HOOK_INPUT_TOO_LARGE');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(input);
  if (text.includes('\u0000')) throw new Error('HOOK_INPUT_BINARY');
  return text;
}

export function parseHookPayload(input: Uint8Array): unknown {
  const text = parseHookText(input);
  const parsed: unknown = JSON.parse(text);
  if (containsNul(parsed)) throw new Error('HOOK_INPUT_BINARY');
  return parsed;
}

function physicalPath(path: string): string {
  const absolute = resolve(path);
  let existing = absolute;
  const suffix: string[] = [];
  while (true) {
    try {
      return join(realpathSync(existing), ...suffix);
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return absolute;
      suffix.unshift(basename(existing));
      existing = parent;
    }
  }
}

export function discoverProjectRoot(start: string): string {
  let current = physicalPath(start);
  while (true) {
    if (
      existsSync(join(current, '.void', 'config.json'))
      || existsSync(join(current, '.git'))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return physicalPath(start);
    current = parent;
  }
}

function projectRelativePath(root: string, path: string): string | undefined {
  const physicalRoot = physicalPath(root);
  const absolute = physicalPath(isAbsolute(path) ? path : resolve(physicalRoot, path));
  const projectPath = relative(physicalRoot, absolute).replaceAll('\\', '/');
  return projectPath === '..' || projectPath.startsWith('../') || isAbsolute(projectPath)
    ? undefined
    : projectPath;
}

function projectEdits(root: string, edits: readonly NormalizedEdit[]): NormalizedEdit[] {
  return edits.flatMap((edit) => {
    const path = projectRelativePath(root, edit.path);
    return path === undefined ? [] : [{ ...edit, path }];
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function configuredString(
  parent: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = parent?.[key];
  return typeof value === 'string' ? value : fallback;
}

interface TddConfig {
  readonly mode: TddMode;
  readonly businessGlob: string;
  readonly spikesGlob: string;
}

function readTddConfig(root: string): TddConfig {
  let config: Record<string, unknown> = {};
  try {
    config = record(JSON.parse(readFileSync(join(root, '.void/config.json'), 'utf8'))) ?? {};
  } catch {
    // Missing or invalid optional config keeps safe defaults.
  }
  const modes = record(config['modes']);
  const paths = record(config['paths']);
  const configuredMode = configuredString(modes, 'tdd', 'auto');
  const mode: TddMode = configuredMode === 'strict'
    || configuredMode === 'souple'
    || configuredMode === 'exploratory'
    ? configuredMode
    : 'auto';
  return {
    mode,
    businessGlob: configuredString(paths, 'business', 'apps/*/src/**'),
    spikesGlob: configuredString(paths, 'spikes', 'apps/*/scripts/spike-*'),
  };
}

function readHeader(path: string): string {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    const buffer = Buffer.alloc(8192);
    const bytes = readSync(descriptor, buffer, 0, buffer.byteLength, 0);
    return buffer.subarray(0, bytes).toString('utf8');
  } catch {
    return '';
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function tddVerdict(root: string, edits: readonly NormalizedEdit[]): RuleVerdict {
  const physicalRoot = physicalPath(root);
  const projectChanges = projectEdits(physicalRoot, edits);
  const config = readTddConfig(physicalRoot);
  const existingHeaders: Record<string, string> = {};
  const siblingTests = new Set<string>();
  for (const edit of projectChanges) {
    existingHeaders[edit.path] = readHeader(join(physicalRoot, edit.path));
    for (const sibling of [
      edit.path.replace(/\.tsx$/, '.test.tsx'),
      edit.path.replace(/\.ts$/, '.test.ts'),
      edit.path.replace(/\.jsx$/, '.test.jsx'),
      edit.path.replace(/\.js$/, '.test.js'),
    ]) {
      if (sibling !== edit.path && existsSync(join(physicalRoot, sibling))) {
        siblingTests.add(sibling);
      }
    }
  }
  return tddOrder({
    edits: projectChanges,
    mode: config.mode,
    businessGlobs: [config.businessGlob],
    spikeGlobs: [config.spikesGlob],
    existingHeaders,
    siblingTests,
  });
}

export function evaluateRule(
  rule: RuleName,
  rawInput: unknown,
  options: EvaluateRuleOptions,
): RuleVerdict {
  const call = normalizeToolCall(rawInput);
  const env = options.env ?? process.env;
  if (rule === 'dangerous-command') {
    if (call.tool !== 'Bash' && call.tool !== 'shell') return allow();
    if (env['VOID_HARNESS_ALLOW_DANGEROUS'] === '1') return allow('OVERRIDE', 'one-shot override');
    return dangerousCommand(call.command);
  }
  if (
    call.tool !== 'Edit'
    && call.tool !== 'Write'
    && call.tool !== 'apply_patch'
    && call.tool !== 'Bash'
    && call.tool !== 'shell'
  ) {
    return allow();
  }
  if (rule === 'protected-file') {
    if (env['VOID_HARNESS_ALLOW_SECRET_EDIT'] === '1') return allow('OVERRIDE', 'one-shot override');
    return protectedFile(call.edits.map((edit) => edit.path));
  }
  if (rule === 'secret-content') return secretContent(call.edits);
  if (rule === 'tdd-order') return tddVerdict(options.root, call.edits);
  rule satisfies never;
  throw new Error('UNKNOWN_ENFORCEMENT_RULE');
}
