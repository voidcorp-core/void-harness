// Whether an integrated cluster may merge itself, and what it costs to say no.
//
// The principle this serves is unchanged: no union merges without being read.
// Only the reader changed. A human reads it where production is the next step;
// an adversarial fresh-context pass over the whole integrated diff reads it
// everywhere else. See the union-is-read-before-it-merges decision.
//
// Pure. This judges an observation; it merges nothing, spawns nothing, and asks
// no runtime for anything. The caller runs the reading and hands back what it
// returned.
//
// The failure mode being designed against is not a reader that finds nothing. It
// is a reader that never ran, could not finish, or answered about a different
// tree, and whose silence gets read as approval. All three refuse here, and they
// refuse with the same words a human would need to unblock them.

import { planLensExecution, type LensPlan, type OrchestrationCapability } from '@voidcorp/mission-engine';
import type { ProtectionObservation } from './branch-protection.js';
import { autopilotFailure } from './errors.js';

/** A contradiction between workers that no single worker could have seen. */
export interface Contradiction {
  readonly summary: string;
  /** Concrete anchors, so the finding can be checked rather than believed. */
  readonly evidence: readonly string[];
}

/**
 * `clean` means the reader tried to refute the union and failed to.
 * `contradicted` means it succeeded. `inconclusive` means it could not finish,
 * which clears nothing.
 */
export type UnionVerdict = 'clean' | 'contradicted' | 'inconclusive';

export interface UnionReview {
  readonly schemaVersion: 1;
  /** The tree this verdict is about. A verdict about another tree is not one. */
  readonly integrationSha: string;
  readonly verdict: UnionVerdict;
  readonly contradictions: readonly Contradiction[];
}

export interface MergeGrantInput {
  /** Branch this pull request would merge into. */
  readonly target: string;
  /** The branch that deploys. Never assumed to be called `main`. */
  readonly deployBranch: string;
  /** Head of the integration branch as it stands now. */
  readonly integrationSha: string;
  /** What the union reader returned, or undefined if none ran. */
  readonly review: UnionReview | undefined;
  /** Units this cluster carries. Empty when the caller tracks none. */
  readonly tickets?: readonly string[] | undefined;
  /** Units the programme declared a human gate, from `humanGates`. */
  readonly humanGates?: readonly string[] | undefined;
  /**
   * Server-side protection of the target, as observed. `undefined` means the
   * caller could not observe it, which is refused exactly like unprotected --
   * an unauthenticated `gh`, a network blip and a genuinely open branch look
   * identical from in here, and only one of them is safe.
   */
  readonly protection?: ProtectionObservation | undefined;
  /** Every path the integrated diff touches, or undefined if it could not be listed. */
  readonly changedPaths?: readonly string[] | undefined;
  /**
   * Paths a machine merge never takes unread. Defaults to `DEFAULT_MERGE_BLOCKS`.
   *
   * Deliberately NOT `ownership.sequential`: that list answers which paths two
   * workers cannot write at once, and it names regenerated mirrors whose contents
   * a check already proves. Reusing it here refuses clusters that are perfectly
   * safe to merge, which is how a guard stops protecting and starts obstructing.
   */
  readonly mergeBlocks?: readonly string[] | undefined;
}

export type MergeRefusal =
  | 'production-downstream'
  | 'human-gate'
  | 'base-unprotected'
  | 'sensitive-path'
  | 'union-unread'
  | 'union-contradicted'
  | 'review-stale';

/**
 * Every refusal the grant can return, in a stable order. Written out rather than
 * derived from the union type, so the compiler proves the list exhaustive instead
 * of a cast asserting it -- and so a test can hold the shipped skill to it.
 *
 * That test exists because the skill shipped for days telling consumers
 * "`mergeGate: human` is the only value the programme descriptor accepts" while
 * the CLI accepted `union-reviewed` and could merge on its own. Prose has no
 * compiler; this list is the closest thing it gets.
 */
export const MERGE_REFUSALS = [
  'production-downstream',
  'human-gate',
  'base-unprotected',
  'sensitive-path',
  'union-unread',
  'union-contradicted',
  'review-stale',
] as const satisfies readonly MergeRefusal[];

export type MergeGrant =
  | { readonly kind: 'granted' }
  | {
      readonly kind: 'refused';
      readonly reason: MergeRefusal;
      readonly detail: string;
      readonly fix: string;
    };

function refused(reason: MergeRefusal, detail: string, fix: string): MergeGrant {
  return { kind: 'refused', reason, detail, fix };
}

/**
 * Where being wrong is expensive and invisible in a diff.
 *
 * A migration mutates shared state no file list describes. A workflow under
 * `.github/` decides who may publish, so merging one unread hands that decision
 * away. A lockfile decides what every consumer installs, which is the supply
 * chain. Everything else is ordinary code the union reading is there to judge.
 *
 * Kept short on purpose. Every path added here is a merge a person has to do by
 * hand for as long as it stays, and a guard that fires on ordinary work is one
 * people route around.
 */
export const DEFAULT_MERGE_BLOCKS: readonly string[] = Object.freeze([
  '**/migrations/**',
  '.github/workflows/**',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
]);

const short = (sha: string): string => sha.slice(0, 7);

/**
 * Does `pattern` cover `path`? Exact match, or a `**` prefix glob.
 *
 * Deliberately the smallest matcher that reads the `ownership.sequential` shapes
 * this repository actually declares (`pnpm-lock.yaml`, `packages/core-assets/**`).
 * A fuller glob engine here would be a second answer to a question the programme
 * parser already answers, and the failure direction of a narrow matcher is a
 * refusal that was not raised -- so the caller is told to keep the patterns
 * literal rather than clever.
 */
function matchesPath(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (!pattern.includes('**')) return false;
  // `**/x/**` matches the segment anywhere; `a/b/**` matches a prefix.
  if (pattern.startsWith('**/')) {
    const middle = pattern.slice(3).replace(/\/\*\*$/, '');
    return path === middle || path.includes(`/${middle}/`) || path.startsWith(`${middle}/`);
  }
  return path.startsWith(pattern.slice(0, pattern.indexOf('**')));
}

export function judgeMergeGrant(input: MergeGrantInput): MergeGrant {
  // Production first, and deliberately before every other check. When the target
  // deploys and the reading is also stale, reporting the stale reading would send
  // someone to run a pass that cannot unlock anything.
  if (input.target === input.deployBranch) {
    return refused(
      'production-downstream',
      `merging into \`${input.target}\` ships, and what a person judges there is the feature`,
      'merge it yourself once you have seen the integration branch behave',
    );
  }

  // The three below sit ahead of every review check, for the reason the one above
  // does: a refusal no re-reading can lift must not send anyone off to re-read.
  // They are ordered by how far each is from the diff -- a declaration about the
  // work, then about the branch, then about the paths.

  // A unit the programme named a human gate is a statement about the work, and no
  // verdict on the diff answers it.
  const gated = (input.tickets ?? []).filter((ticket) => (input.humanGates ?? []).includes(ticket));
  if (gated.length > 0) {
    return refused(
      'human-gate',
      `the cluster carries ${gated.join(', ')}, which the programme declares a human gate`,
      'merge it yourself, or take the gated unit out of the cluster',
    );
  }

  // Server-side protection is the only thing that actually stops a bad push; a
  // check the harness runs on itself proves nothing about the remote. Absent and
  // unknown are refused like unprotected, which is how the lease already reads them.
  const protection = input.protection;
  if (protection === undefined || protection.kind !== 'protected') {
    const why = protection === undefined
      ? 'it was not observed'
      : protection.kind === 'unknown'
        ? `it could not be read: ${protection.reason}`
        : 'the branch carries none';
    return refused(
      'base-unprotected',
      `protection of \`${input.target}\` is not established -- ${why}`,
      'protect the base with required checks, then ask again; unknown is not protected',
    );
  }

  // The paths the programme already declares single-writer are exactly the ones a
  // machine must not merge unread: a migration mutates shared state no diff
  // describes, and a lockfile decides what every consumer installs.
  const blocked = input.mergeBlocks ?? DEFAULT_MERGE_BLOCKS;
  if (blocked.length > 0) {
    if (input.changedPaths === undefined) {
      return refused(
        'sensitive-path',
        'the integrated diff could not be listed, so it cannot be shown to avoid the declared paths',
        'list the diff against the base, then ask again',
      );
    }
    const touched = input.changedPaths.filter((path) =>
      blocked.some((pattern) => matchesPath(pattern, path)),
    );
    if (touched.length > 0) {
      return refused(
        'sensitive-path',
        `the diff touches ${touched.slice(0, 3).join(', ')}, which a machine does not merge unread`,
        'merge it yourself; a migration, a publish workflow or a lockfile is a human call',
      );
    }
  }

  const review = input.review;
  if (review === undefined) {
    return refused(
      'union-unread',
      'no union review ran, and an unread union is not a clean one',
      'run the union review over the integrated diff, then ask again',
    );
  }
  if (review.verdict === 'inconclusive') {
    return refused(
      'union-unread',
      'the union review could not finish, which clears nothing',
      'run the union review again; a reading that stopped early is not a verdict',
    );
  }
  // Before the verdict is trusted, check it is about this tree. A range added, a
  // conflict resolved, or a CI correction pushed after the reading moves the
  // head, and a clean verdict then describes bytes that are no longer here.
  if (review.integrationSha !== input.integrationSha) {
    return refused(
      'review-stale',
      `the union review is about ${short(review.integrationSha)}, and the branch is now at ${short(input.integrationSha)}`,
      'run the union review against the current head',
    );
  }
  if (review.verdict === 'contradicted') {
    const first = review.contradictions[0];
    const named = first === undefined
      ? 'the union review refuted the integrated diff'
      : `the union review found: ${first.summary}`;
    const more = review.contradictions.length > 1
      ? ` (and ${String(review.contradictions.length - 1)} more)`
      : '';
    return refused(
      'union-contradicted',
      `${named}${more}`,
      'fix what the review named, then read the union again against the new head',
    );
  }
  return { kind: 'granted' };
}


const MAX_CONTRADICTIONS = 50;
const MAX_EVIDENCE = 20;
const MAX_TEXT = 2000;
const VERDICTS: readonly UnionVerdict[] = ['clean', 'contradicted', 'inconclusive'];

function invalid(problem: string, cause: string, fix: string): never {
  throw autopilotFailure('AUTOPILOT_CONTRACT', problem, cause, fix);
}

export interface UnionReviewRequest {
  readonly schemaVersion: 1;
  readonly integrationBranch: string;
  readonly integrationSha: string;
  /** argv producing the whole integrated diff, base to head. */
  readonly diffCommand: readonly string[];
  readonly instruction: string;
  readonly ticketIds: readonly string[];
  /**
   * How many readers run and in what shape, on the runtime actually present.
   *
   * Required rather than defaulted: a request that does not know its own width
   * would be guessing, and the verdict has to name what really ran.
   */
  readonly lensPlan: LensPlan;
}

export interface UnionReviewRequestInput {
  readonly integrationBranch: string;
  readonly integrationSha: string;
  readonly baseSha: string;
  readonly ticketIds: readonly string[];
  readonly declaredLenses: number;
  readonly capability: OrchestrationCapability;
}

/**
 * What the union reader is asked, and over what.
 *
 * The diff spans base to head rather than any single worker range: the defect
 * this pass exists for is two workers each locally correct and disagreeing with
 * each other, which no range contains.
 *
 * The instruction says refute. A pass told to check for problems reports none
 * and means nothing by it; a pass told to break the union and failing has made a
 * claim that can be wrong, which is what makes a clean verdict worth having.
 */
export function buildUnionReviewRequest(input: UnionReviewRequestInput): UnionReviewRequest {
  return {
    schemaVersion: 1,
    integrationBranch: input.integrationBranch,
    integrationSha: input.integrationSha,
    diffCommand: ['git', 'diff', `${input.baseSha}..${input.integrationSha}`],
    instruction: [
      'Read the whole integrated diff and try to REFUTE it. You are not checking',
      'for problems: you are trying to break the union, and reporting only what',
      'survived. Each worker was correct in isolation and each range already',
      'passed its own gates, so per-file review adds nothing here.',
      'Look for what only the union shows: the same concept named twice, two',
      'modules that disagree about a word, an assertion in one range that another',
      'range falsifies, a proof that does not prove what it claims.',
      'Report a contradiction only with a concrete anchor a reader can open.',
      'Finding nothing means you failed to refute it, which is the verdict; it',
      'does not mean the diff is good.',
    ].join(' '),
    ticketIds: [...input.ticketIds],
    // Adversarial, which is the one demand this pass genuinely makes: its value
    // is readers trying to break each other's reading of the same diff. Where the
    // runtime cannot carry a conversation the controller arbitrates successive
    // rounds instead, and the plan says which of the two happened.
    lensPlan: planLensExecution(
      { declaredLenses: input.declaredLenses, wants: 'adversarial-debate' },
      input.capability,
    ),
  };
}

function parseContradictions(value: unknown): readonly Contradiction[] {
  if (!Array.isArray(value) || value.length > MAX_CONTRADICTIONS) {
    invalid(
      'the union review has an unusable contradiction list',
      `\`contradictions\` must be an array of at most ${MAX_CONTRADICTIONS} entries`,
      'report each contradiction as one entry with a summary and its anchors',
    );
  }
  return value.map((entry) => {
    const found = entry as Partial<Contradiction>;
    const summary = found?.summary;
    if (typeof summary !== 'string' || summary.trim().length === 0 || summary.length > MAX_TEXT) {
      invalid(
        'a union contradiction does not say what it found',
        '`summary` must be a non-empty string',
        'state each contradiction as one bounded sentence',
      );
    }
    const evidence = found?.evidence;
    // A finding with no anchor cannot be checked or fixed, and would block the
    // merge on an assertion nobody can act on. Refused rather than downgraded.
    if (
      !Array.isArray(evidence)
      || evidence.length === 0
      || evidence.length > MAX_EVIDENCE
      || evidence.some((item) => typeof item !== 'string' || item.trim().length === 0)
    ) {
      invalid(
        'a union contradiction names nowhere to look',
        `\`evidence\` must hold 1 to ${MAX_EVIDENCE} non-empty anchors`,
        'give each contradiction at least one file, path or identifier a reader can open',
      );
    }
    return { summary, evidence: [...evidence] as readonly string[] };
  });
}

/**
 * The boundary where the reader's prose stops.
 *
 * `observedSha` is the tree the CALLER took the diff from. The reader never
 * supplies it: it is the one field that could turn a stale verdict into a
 * fresh-looking one, so a claimed value is ignored rather than trusted.
 *
 * Unparsable output throws. Defaulting to `clean` would make every malformed
 * answer an approval, which is the failure this whole pass exists to prevent.
 */
export function parseUnionReview(raw: unknown, observedSha: string): UnionReview {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    invalid(
      'the union review is not an object',
      'the reader returned something that is not a JSON object',
      'have the reader return { verdict, contradictions }',
    );
  }
  const body = raw as { readonly verdict?: unknown; readonly contradictions?: unknown };
  const verdict = body.verdict;
  if (typeof verdict !== 'string' || !VERDICTS.includes(verdict as UnionVerdict)) {
    invalid(
      'the union review does not carry a usable verdict',
      `\`verdict\` must be one of ${VERDICTS.join(', ')}`,
      'have the reader answer clean, contradicted or inconclusive',
    );
  }
  return {
    schemaVersion: 1,
    integrationSha: observedSha,
    verdict: verdict as UnionVerdict,
    contradictions: parseContradictions(body.contradictions),
  };
}

/**
 * The verdict of a reading that never returned -- a timeout, an adapter failure,
 * an interrupted run. Not clean and not contradicted: it cleared nothing, and it
 * says so rather than falling back to a default someone would read as approval.
 */
export function inconclusiveReview(observedSha: string): UnionReview {
  return { schemaVersion: 1, integrationSha: observedSha, verdict: 'inconclusive', contradictions: [] };
}


/** Where the checks stand, as `planCheckResponse` reports it. */
export type CheckStand = 'ready' | 'fix' | 'escalate' | 'wait';

export type PostCheckAction = 'merge' | 'await-human' | 'hold';

export interface PostCheckOutcome {
  readonly action: PostCheckAction;
  readonly detail: string;
}

/**
 * What happens to a published integration branch once its checks have spoken.
 *
 * Two questions that must not collapse into one. Where the checks stand is not
 * whether this union may merge itself, and deciding the second while the first
 * is unsettled would decide it on evidence that does not exist yet -- so
 * anything but `ready` holds, whatever the grant says.
 */
export function planPostCheckAction(input: {
  readonly checks: CheckStand;
  readonly grant: MergeGrant;
}): PostCheckOutcome {
  if (input.checks !== 'ready') {
    return { action: 'hold', detail: 'the checks have not settled; nothing to decide yet' };
  }
  if (input.grant.kind === 'granted') {
    return { action: 'merge', detail: 'checks are green and the union came back clean' };
  }
  // The reason travels with the hand-off. A branch left to a person without one
  // makes them re-derive what the run already knew.
  return { action: 'await-human', detail: input.grant.detail };
}
