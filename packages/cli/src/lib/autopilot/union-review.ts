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
  /**
   * Units this cluster carries. Empty when the caller tracks none.
   *
   * Required, not optional. Every other input here fails closed when it is
   * missing, and an optional list that defaults to empty fails OPEN: forgetting
   * to pass the cluster would silently clear the human gate. The absence that
   * matters is a programmer's omission rather than a failed observation, so the
   * compiler refuses it instead of the function.
   */
  readonly tickets: readonly string[];
  /** Units the programme declared a human gate, from `humanGates`. Same reason. */
  readonly humanGates: readonly string[];
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
   * See the merge-blocks-are-not-sequential-ownership decision.
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

/**
 * What actually raises each refusal, in the words the shipped skill must use.
 *
 * The list of refusal NAMES above was not enough. `SKILL.md` named every one of
 * them and still described `sensitive-path` as firing on `ownership.sequential`,
 * which is the opposite of what the code does -- the token was present, so the
 * test stayed green while the documentation told a consumer the wrong thing.
 *
 * So the condition lives here, next to the code that applies it, and the skill
 * quotes it. A test compares the two. Changing the behaviour without changing
 * the sentence now fails, which is the only way prose keeps up with a compiler.
 */
export const MERGE_REFUSAL_TRIGGERS = {
  'production-downstream': 'the target is the branch that deploys',
  'human-gate': 'the cluster carries a unit listed in `humanGates`',
  'base-unprotected':
    'server-side protection of the base was not positively observed, and unknown counts as unprotected',
  'sensitive-path':
    'the diff touches a migration, a workflow or action under `.github/`, a lockfile or `CODEOWNERS`'
    + ' (the `mergeBlocks` list, deliberately not `ownership.sequential`), or the diff could not be listed',
  'union-unread': 'no reading ran, or the one that ran could not finish',
  'union-contradicted': 'the reading refuted the integrated diff',
  'review-stale': 'the reading is about a tree the branch head has moved away from',
} as const satisfies Readonly<Record<MergeRefusal, string>>;

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
  // What a migration directory holds that RUNS. A guide under `docs/migrations/`
  // is prose about migrations, and blocking it costs a hand merge for nothing.
  '**/migrations/**/*.sql',
  '**/migrations/**/*.ts',
  '**/migrations/**/*.js',
  // Drizzle's journal. Its contents decide which migrations are considered
  // applied, so a wrong merge here is a migration that silently never runs.
  '**/migrations/meta/**',
  // Both halves of `.github/`: a composite action is executed by the workflows
  // that publish, so leaving actions out left the door it guards open.
  '.github/workflows/**',
  '.github/actions/**',
  // Every lockfile, at any depth: a workspace member has its own, and the one
  // that decides an install is not always the one at the root.
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/bun.lockb',
  // Bun writes a text lockfile since 1.2, and kept the binary name for the old
  // one. Two names, one job.
  '**/bun.lock',
  // Who may approve a change to any of the above.
  '**/CODEOWNERS',
]);

const short = (sha: string): string => sha.slice(0, 7);

/** Longer than any real repository path, and the bound on the matcher's work. */
const MAX_SEGMENTS = 64;
const MAX_PATTERN_LENGTH = 200;
const MAX_GLOBSTARS = 3;

/**
 * Is this pattern one the matcher below actually implements?
 *
 * The previous matcher degraded to exact equality for anything without `**`, and
 * read a globstar in the middle of a pattern as a plain prefix, so one meant to
 * name migrations under `packages` matched the whole tree. Both failures were
 * silent, and one of them refused every file in the repository while the other
 * refused none. A pattern this cannot honour is refused out loud instead.
 */
export function isSupportedMergeBlock(pattern: string): boolean {
  if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) return false;
  const segments = pattern.split('/');
  if (segments.length > MAX_SEGMENTS) return false;
  if (segments.filter((segment) => segment === '**').length > MAX_GLOBSTARS) return false;
  return segments.every(
    (segment) => segment.length > 0 && (segment === '**' || !segment.includes('**')),
  );
}

/** `*` stands for any run of characters that does not cross a `/`. */
function matchesSegment(pattern: string, segment: string): boolean {
  const parts = pattern.split('*');
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  if (parts.length === 1) return pattern === segment;
  if (!segment.startsWith(first) || !segment.endsWith(last)) return false;
  if (segment.length < first.length + last.length) return false;
  let cursor = first.length;
  for (let index = 1; index < parts.length - 1; index += 1) {
    const part = parts[index] ?? '';
    const found = segment.indexOf(part, cursor);
    if (found === -1 || found + part.length > segment.length - last.length) return false;
    cursor = found + part.length;
  }
  return true;
}

/**
 * Walk pattern and path together, `**` standing for zero or more whole segments.
 *
 * Zero is the case the hand-rolled version got wrong in both directions: a
 * migrations pattern ending in a globstar then an extension has to match
 * `migrations/001.sql`, and a globstar between `packages` and `migrations` must
 * NOT match `packages/cli/src/x.ts`.
 */
function matchesFrom(
  patterns: readonly string[],
  patternIndex: number,
  segments: readonly string[],
  segmentIndex: number,
): boolean {
  if (patternIndex === patterns.length) return segmentIndex === segments.length;
  if (patterns[patternIndex] === '**') {
    for (let index = segmentIndex; index <= segments.length; index += 1) {
      if (matchesFrom(patterns, patternIndex + 1, segments, index)) return true;
    }
    return false;
  }
  if (segmentIndex === segments.length) return false;
  return matchesSegment(patterns[patternIndex] ?? '', segments[segmentIndex] ?? '')
    && matchesFrom(patterns, patternIndex + 1, segments, segmentIndex + 1);
}

function matchesPath(pattern: string, path: string): boolean {
  const segments = path.split('/');
  if (segments.length > MAX_SEGMENTS) return false;
  return matchesFrom(pattern.split('/'), 0, segments, 0);
}

/**
 * One branch name, in the one shape a comparison can be trusted on.
 *
 * `target` is resolved from the remote and arrives canonical. `deployBranch` is
 * typed by a person into a programme descriptor and is validated by nothing --
 * so `origin/main`, `refs/heads/main`, `Main` and `main ` all failed to equal the
 * resolved `main`, and the branch that ships was granted to a machine. The one
 * refusal that must never be wrong was the only input with no shape.
 *
 * Case is folded deliberately. Git treats `Main` and `main` as two branches, so
 * folding can only ever refuse a pair git would have let through, and every error
 * this check makes has to be a refusal.
 */
function branchIdentity(name: string): string {
  const trimmed = name.trim();
  for (const prefix of ['refs/heads/', 'refs/remotes/', 'remotes/']) {
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length).toLowerCase();
  }
  return trimmed.toLowerCase();
}

/**
 * Do these two names risk being the same branch?
 *
 * `origin/main` and `main` cannot be told apart from `release/main` and `main`
 * without knowing the remotes, and this function has no way to know them. So it
 * refuses both: a suffix match on a whole segment counts as the same branch.
 *
 * That costs a false refusal to a project integrating into `release/main` while
 * shipping from `main`. The trade is not symmetric. A false refusal is a merge a
 * person does by hand and can see; the other direction is a machine merging into
 * production, which nobody sees until it has shipped.
 */
function sameBranch(target: string, deployBranch: string): boolean {
  const left = branchIdentity(target);
  const right = branchIdentity(deployBranch);
  if (left === right) return true;
  return left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

export function judgeMergeGrant(input: MergeGrantInput): MergeGrant {
  // Production first, and deliberately before every other check. When the target
  // deploys and the reading is also stale, reporting the stale reading would send
  // someone to run a pass that cannot unlock anything.
  // A `deployBranch` that names nothing is not an absence of production, it is an
  // unusable declaration -- and this is the check whose silence costs the most.
  const deploy = input.deployBranch.trim();
  if (deploy.length === 0) {
    return refused(
      'production-downstream',
      'the programme declares no branch that deploys, so no target can be shown not to be it',
      'set `autopilot.deployBranch` to the branch that ships, then ask again',
    );
  }
  if (sameBranch(input.target, deploy)) {
    return refused(
      'production-downstream',
      `merging into \`${input.target}\` ships, and what a person judges there is the feature`,
      'merge it yourself once you have seen the integration branch behave;'
        + ' a target ending in the deploying branch is read as that branch',
    );
  }

  // The three below sit ahead of every review check, for the reason the one above
  // does: a refusal no re-reading can lift must not send anyone off to re-read.
  // They are ordered by how far each is from the diff -- a declaration about the
  // work, then about the branch, then about the paths.

  // A unit the programme named a human gate is a statement about the work, and no
  // verdict on the diff answers it.
  const gated = input.tickets.filter((ticket) => input.humanGates.includes(ticket));
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

  // A diff nobody could list is refused before the list is even consulted. It was
  // inside the `blocked.length > 0` branch, which made `mergeBlocks: []` drop the
  // refusal on an unreadable diff along with the paths -- an empty list is
  // "nothing is sensitive", never "stop checking whether the diff exists".
  if (input.changedPaths === undefined) {
    return refused(
      'sensitive-path',
      'the integrated diff could not be listed, so it cannot be shown to avoid the declared paths',
      'list the diff against the base, then ask again',
    );
  }
  const blocked = input.mergeBlocks ?? DEFAULT_MERGE_BLOCKS;
  // A pattern the matcher cannot honour refuses out loud. Skipping it would make
  // the guard narrower than its declaration says, which is the one direction a
  // silent failure must never take here.
  const unsupported = blocked.filter((pattern) => !isSupportedMergeBlock(pattern));
  if (unsupported.length > 0) {
    return refused(
      'sensitive-path',
      `\`mergeBlocks\` declares ${unsupported.slice(0, 3).join(', ')}, which this matcher does not implement`,
      'write each pattern as literal segments, `*` inside one segment and `**` as a whole one',
    );
  }
  const oversized = input.changedPaths.filter((path) => path.split('/').length > MAX_SEGMENTS);
  if (oversized.length > 0) {
    return refused(
      'sensitive-path',
      `the diff names a path this guard cannot read: ${oversized.slice(0, 1).join('')}`,
      'merge it yourself; a path no guard could match is not a path it cleared',
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
