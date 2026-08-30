import { canonicalJsonHash } from '../evidence/canonical-json.js';

/**
 * What a convened specialist reads instead of exploring the repository.
 *
 * Measured on 2026-08-30: five specialists convened on a real diff spent both of
 * their turns searching and returned a transition sentence, because `Grep` and
 * `Glob` both spawn a `rg` binary that is absent on a machine where `rg` is only
 * a shell function. They are handed the diff here rather than asked to find it,
 * which is also what makes convening the whole panel on every ticket affordable.
 */

/** How much of the pack a specialist is given, per the panel-is-a-floor decision. */
export type ContextLens = 'full' | 'reduced';

export interface ContextArtifact {
  readonly path: string;
  readonly text: string;
}

export interface ContextPackInput {
  readonly diff: string;
  readonly touchedPaths: readonly string[];
  readonly artifacts: readonly ContextArtifact[];
  readonly lens: ContextLens;
  readonly budgetTokens: number;
  /** What the caller could not obtain at all, named rather than left blank. An
   * empty diff and an unavailable diff look identical to a reader otherwise. */
  readonly unavailable?: readonly string[];
}

export interface ContextPack {
  readonly schemaVersion: 1;
  readonly contextId: string;
  readonly lens: ContextLens;
  readonly diff: string;
  readonly diffTruncated: boolean;
  readonly touchedPaths: readonly string[];
  readonly artifacts: readonly ContextArtifact[];
  /** Everything the budget refused, named. A silent cap reads as full coverage. */
  readonly omitted: readonly string[];
  readonly estimatedTokens: number;
}

const BUDGET_TOKENS_MIN = 1;
const BUDGET_TOKENS_MAX = 64_000;
const TOUCHED_PATHS_MAX = 512;
const ARTIFACTS_MAX = 64;
/** A reduced lens buys a specialist that has nothing to say a cheap way to say it. */
const REDUCED_LENS_DIVISOR = 8;
const CHARS_PER_TOKEN = 4;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:/;

function invalid(detail: string): never {
  throw new Error(`CONTEXT_PACK_INVALID: ${detail}`);
}

/** Approximate, and deliberately so: a real tokenizer would be a dependency and a
 * moving target, while the budget only has to bound the pack rather than price it. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** A pack must never point outside the repository it describes. */
function assertRepositoryPath(path: string, subject: string): void {
  if (typeof path !== 'string' || path.trim().length === 0 || path.includes('\0')) {
    invalid(`${subject} is not a usable path`);
  }
  if (path.startsWith('/') || path.startsWith('\\') || WINDOWS_ABSOLUTE.test(path)) {
    invalid(`${subject} is absolute: ${path}`);
  }
  if (path.split(/[\\/]/).includes('..')) {
    invalid(`${subject} escapes the repository: ${path}`);
  }
}

export function compileContextPack(input: ContextPackInput): ContextPack {
  if (
    !Number.isSafeInteger(input.budgetTokens)
    || input.budgetTokens < BUDGET_TOKENS_MIN
    || input.budgetTokens > BUDGET_TOKENS_MAX
  ) {
    invalid(`budgetTokens must be between ${BUDGET_TOKENS_MIN} and ${BUDGET_TOKENS_MAX}`);
  }
  if (input.lens !== 'full' && input.lens !== 'reduced') invalid('lens is invalid');
  if (typeof input.diff !== 'string' || input.diff.includes('\0')) invalid('diff is invalid');
  if (!Array.isArray(input.touchedPaths) || input.touchedPaths.length > TOUCHED_PATHS_MAX) {
    invalid(`touchedPaths must hold at most ${TOUCHED_PATHS_MAX} entries`);
  }
  if (!Array.isArray(input.artifacts) || input.artifacts.length > ARTIFACTS_MAX) {
    invalid(`artifacts must hold at most ${ARTIFACTS_MAX} entries`);
  }
  for (const path of input.touchedPaths) assertRepositoryPath(path, 'a touched path');
  for (const artifact of input.artifacts) assertRepositoryPath(artifact.path, 'an artifact path');

  const budget = input.lens === 'reduced'
    ? Math.max(BUDGET_TOKENS_MIN, Math.floor(input.budgetTokens / REDUCED_LENS_DIVISOR))
    : input.budgetTokens;
  const omitted: string[] = [...(input.unavailable ?? [])];
  if (omitted.length > ARTIFACTS_MAX) invalid('unavailable holds too many entries');
  for (const entry of omitted) {
    if (typeof entry !== 'string' || entry.trim().length === 0 || entry.includes('\0')) {
      invalid('an unavailable entry is not usable text');
    }
  }

  // The diff is the subject, so it is served first and truncated rather than
  // dropped. A specialist that saw part of a diff must know it, which is why the
  // truncation is both a flag and a named omission.
  const diffAllowance = budget * CHARS_PER_TOKEN;
  const diffTruncated = input.diff.length > diffAllowance;
  const diff = diffTruncated ? input.diff.slice(0, diffAllowance) : input.diff;
  if (diffTruncated) omitted.push('diff (truncated)');

  let spent = estimateTokens(diff);
  const touchedPaths: string[] = [];
  for (const path of input.touchedPaths) {
    const cost = estimateTokens(path);
    if (spent + cost > budget) {
      omitted.push(path);
      continue;
    }
    spent += cost;
    touchedPaths.push(path);
  }

  const artifacts: ContextArtifact[] = [];
  for (const artifact of input.artifacts) {
    const cost = estimateTokens(artifact.text);
    if (spent + cost > budget) {
      omitted.push(artifact.path);
      continue;
    }
    spent += cost;
    artifacts.push(Object.freeze({ path: artifact.path, text: artifact.text }));
  }

  const content = Object.freeze({
    schemaVersion: 1 as const,
    lens: input.lens,
    diff,
    diffTruncated,
    touchedPaths: Object.freeze([...touchedPaths]),
    artifacts: Object.freeze([...artifacts]),
    omitted: Object.freeze([...omitted]),
    estimatedTokens: spent,
  });
  return Object.freeze({ ...content, contextId: canonicalJsonHash(content) });
}

const PACK_KEYS = [
  'schemaVersion',
  'contextId',
  'lens',
  'diff',
  'diffTruncated',
  'touchedPaths',
  'artifacts',
  'omitted',
  'estimatedTokens',
] as const;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

interface PackRecord extends Readonly<Record<string, unknown>> {
  readonly schemaVersion?: unknown;
  readonly contextId?: unknown;
  readonly lens?: unknown;
  readonly diff?: unknown;
  readonly diffTruncated?: unknown;
  readonly touchedPaths?: unknown;
  readonly artifacts?: unknown;
  readonly omitted?: unknown;
  readonly estimatedTokens?: unknown;
  readonly path?: unknown;
  readonly text?: unknown;
}

function isRecord(value: unknown): value is PackRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: PackRecord): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...PACK_KEYS].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function textList(value: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) invalid('a bounded text list is invalid');
  return Object.freeze(value.map((item) => {
    if (typeof item !== 'string' || item.includes('\0')) invalid('a list entry is not text');
    return item;
  }));
}

/**
 * Validate a pack that crossed a boundary.
 *
 * The identity check is the load-bearing part: a pack is the only thing a
 * specialist reads, so a pack whose content no longer hashes to its own id is a
 * pack somebody edited between the dispatch and the reading.
 */
export function parseContextPackValue(value: unknown): ContextPack {
  if (!isRecord(value) || !exactKeys(value)) invalid('the pack shape is invalid');
  if (value.schemaVersion !== 1) invalid('schemaVersion is unsupported');
  if (typeof value.contextId !== 'string' || !SHA256.test(value.contextId)) {
    invalid('contextId is malformed');
  }
  if (value.lens !== 'full' && value.lens !== 'reduced') invalid('lens is invalid');
  if (typeof value.diff !== 'string' || value.diff.includes('\0')) invalid('diff is invalid');
  if (typeof value.diffTruncated !== 'boolean') invalid('diffTruncated is invalid');
  if (
    !Number.isSafeInteger(value.estimatedTokens)
    || Number(value.estimatedTokens) < 0
    || Number(value.estimatedTokens) > BUDGET_TOKENS_MAX
  ) {
    invalid('estimatedTokens is out of range');
  }
  const touchedPaths = textList(value.touchedPaths, TOUCHED_PATHS_MAX);
  for (const path of touchedPaths) assertRepositoryPath(path, 'a touched path');
  const omitted = textList(value.omitted, TOUCHED_PATHS_MAX + ARTIFACTS_MAX + 1);
  if (!Array.isArray(value.artifacts) || value.artifacts.length > ARTIFACTS_MAX) {
    invalid('artifacts are invalid');
  }
  const artifacts = Object.freeze(value.artifacts.map((item) => {
    if (
      !isRecord(item)
      || Object.keys(item).length !== 2
      || typeof item.text !== 'string'
      || item.text.includes('\0')
      || typeof item.path !== 'string'
    ) {
      invalid('an artifact is invalid');
    }
    assertRepositoryPath(item.path, 'an artifact path');
    return Object.freeze({ path: item.path, text: item.text });
  }));

  const content = Object.freeze({
    schemaVersion: 1 as const,
    lens: value.lens,
    diff: value.diff,
    diffTruncated: value.diffTruncated,
    touchedPaths,
    artifacts,
    omitted,
    estimatedTokens: Number(value.estimatedTokens),
  });
  if (canonicalJsonHash(content) !== value.contextId) {
    invalid('contextId does not match the pack it labels');
  }
  return Object.freeze({ ...content, contextId: value.contextId });
}
