import { randomUUID as nodeRandomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import {
  mkdir,
  open,
  realpath,
  stat,
} from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import type { DecisionStatus } from './types.js';

export interface CreateDecisionOptions {
  readonly title: string;
  readonly slug: string;
  readonly status?: DecisionStatus;
  readonly deciders?: readonly string[];
  readonly supersedes?: readonly string[];
  readonly now?: Date;
}

export interface CreateDecisionDependencies {
  readonly randomUUID?: () => string;
}

export interface CreatedDecision {
  readonly id: string;
  readonly path: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export async function resolvedPathIsWithinRoot(
  root: string,
  target: string,
): Promise<boolean> {
  const [canonicalRoot, canonicalTarget] = await Promise.all([
    realpath(resolve(root)),
    realpath(resolve(target)),
  ]);
  return isWithin(canonicalRoot, canonicalTarget);
}

export function slugifyDecision(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  if (slug === '') throw new Error('DECISIONS_INVALID_SLUG: slug contains no letters or digits');
  return slug;
}

export async function detectDecisionsDirectory(root: string): Promise<string> {
  const absoluteRoot = resolve(root);
  const candidates = [
    join(absoluteRoot, 'docs', 'decisions-log'),
    join(absoluteRoot, 'docs', 'decisions'),
    join(absoluteRoot, 'decisions'),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return join(absoluteRoot, 'docs', 'decisions');
}

function renderDecision(
  id: string,
  createdAt: string,
  options: CreateDecisionOptions,
): string {
  const status = options.status ?? 'proposed';
  const deciders = options.deciders ?? [];
  const supersedes = options.supersedes ?? [];
  return `---
schemaVersion: 1
id: ${JSON.stringify(id)}
createdAt: ${JSON.stringify(createdAt)}
title: ${JSON.stringify(options.title)}
status: ${status}
deciders: ${JSON.stringify(deciders)}
supersedes: ${JSON.stringify(supersedes)}
---

# ${options.title}

## Context

Describe the forces, constraints, and current pain that make this decision necessary.

## Decision

State the decision in one sentence.

## Consequences

Positive:

- Describe the main benefit.

Negative:

- Describe the accepted cost.

## Alternatives considered

- Describe at least two credible alternatives and why they were rejected.

## Reversal cost

State Low, Medium, or High and explain why.
`;
}

async function assertSafeDirectory(root: string, directory: string): Promise<void> {
  const canonicalRoot = await realpath(resolve(root));
  let existingAncestor = resolve(directory);
  while (!(await exists(existingAncestor))) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const canonicalAncestor = await realpath(existingAncestor);
  if (!isWithin(canonicalRoot, canonicalAncestor)) {
    throw new Error(
      `DECISIONS_PATH_ESCAPE: ${directory} resolves outside ${canonicalRoot}`,
    );
  }
  await mkdir(directory, { recursive: true });
  const canonicalDirectory = await realpath(directory);
  if (!isWithin(canonicalRoot, canonicalDirectory)) {
    throw new Error(
      `DECISIONS_PATH_ESCAPE: ${directory} resolves outside ${canonicalRoot}`,
    );
  }
}

export async function createDecision(
  root: string,
  options: CreateDecisionOptions,
  dependencies: CreateDecisionDependencies = {},
): Promise<CreatedDecision> {
  const directory = await detectDecisionsDirectory(root);
  await assertSafeDirectory(root, directory);
  const slug = slugifyDecision(options.slug);
  const now = options.now ?? new Date();
  const createdAt = now.toISOString();
  const date = createdAt.slice(0, 10);
  const randomUUID = dependencies.randomUUID ?? nodeRandomUUID;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const uuid = randomUUID();
    const id = `adr:${uuid}`;
    const path = join(directory, `${date}-${slug}--${uuid}.md`);
    let handle: FileHandle | undefined;
    try {
      handle = await open(path, 'wx', 0o600);
      await handle.writeFile(renderDecision(id, createdAt, options), 'utf8');
      return { id, path };
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    } finally {
      await handle?.close();
    }
  }

  throw new Error('DECISIONS_ID_COLLISION: exhausted 8 exclusive-create attempts');
}
