// What a worker hands back after running `implement` on one ticket.
//
// A worker is an LLM in a worktree, and its natural output is prose. This
// schema is the boundary where prose stops: anything that does not parse never
// enters the run state, because reconciliation later merges commit ranges by
// their declared SHAs and a wrong one is a silently wrong PR.
//
// Two invariants carry most of the weight:
//
//   - A completed worker must show its work: at least one commit, a head that
//     IS its last commit, and at least one proof that a gate actually ran.
//     "It works" with no gate behind it is the exact failure this prevents.
//   - A blocked worker must say why. A stop with no reason cannot be triaged,
//     and the next session would just re-run it into the same wall.
//
// The worker never pushes, opens a PR, merges, or moves the ticket to review.
// That is not expressible as a type — it lives in the skill contract and its
// tests — but nothing here lets a result claim it did any of those either.

import { autopilotFailure } from './errors.js';

export type WorkerStatus = 'completed' | 'blocked';

/** Order of authority a worker resolves ambiguity with, most specific first. */
export type DecisionBasis = 'ticket' | 'plan' | 'doctrine' | 'convention' | 'safest';

export interface WorkerProof {
  readonly name: string;
  /** argv of the gate that ran, executed with shell:false. */
  readonly command: readonly string[];
  /** sha256 of the gate output, so a proof cannot be asserted without running it. */
  readonly hash: string;
}

export interface WorkerDecision {
  readonly summary: string;
  readonly basis: DecisionBasis;
}

export interface WorkerResult {
  readonly schemaVersion: 1;
  readonly ticketId: string;
  readonly status: WorkerStatus;
  readonly branch: string;
  readonly baseSha: string;
  /** Last commit of the range, or null when the worker committed nothing. */
  readonly headSha: string | null;
  /** Ordered commits attributable to this ticket. */
  readonly commits: readonly string[];
  readonly files: readonly string[];
  readonly proofs: readonly WorkerProof[];
  readonly decisions: readonly WorkerDecision[];
  readonly blocker: string | null;
}

const MAX_COMMITS = 500;
const MAX_FILES = 2000;
const MAX_PROOFS = 50;
const MAX_DECISIONS = 100;
const MAX_TEXT = 2000;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const STATUSES: readonly WorkerStatus[] = ['completed', 'blocked'];
const BASES: readonly DecisionBasis[] = ['ticket', 'plan', 'doctrine', 'convention', 'safest'];

function invalid(problem: string, cause: string, fix: string): never {
  throw autopilotFailure('AUTOPILOT_CONTRACT', problem, cause, fix);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_TEXT) {
    invalid(
      `the worker result field \`${field}\` is unusable`,
      `\`${field}\` must be a non-empty string of at most ${MAX_TEXT} characters`,
      `have the worker report \`${field}\` as one bounded sentence`,
    );
  }
  return value;
}

function parseProofs(value: unknown): readonly WorkerProof[] {
  if (!Array.isArray(value) || value.length > MAX_PROOFS) {
    invalid(
      'the worker result has an unusable proof list',
      `\`proofs\` must be an array of at most ${MAX_PROOFS} entries`,
      'report each gate that ran as one proof entry',
    );
  }
  return value.map((entry) => {
    const proof = entry as Partial<WorkerProof>;
    const command = proof?.command;
    if (!Array.isArray(command) || command.length === 0 || command.some((word) => typeof word !== 'string')) {
      invalid(
        'a worker proof does not name the command it ran',
        `\`command\` is ${JSON.stringify(command)}, not an argv array`,
        'report the gate as an argv array, for example ["pnpm", "test"]',
      );
    }
    if (typeof proof?.hash !== 'string' || !SHA256.test(proof.hash)) {
      invalid(
        'a worker proof carries no verifiable hash',
        `\`hash\` is ${JSON.stringify(proof?.hash)}, not a sha256 digest`,
        'hash the gate output with sha256; a proof that cannot be checked is an assertion',
      );
    }
    return { name: requireText(proof.name, 'proofs[].name'), command: command as string[], hash: proof.hash };
  });
}

function parseDecisions(value: unknown): readonly WorkerDecision[] {
  if (!Array.isArray(value) || value.length > MAX_DECISIONS) {
    invalid(
      'the worker result has an unusable decision list',
      `\`decisions\` must be an array of at most ${MAX_DECISIONS} entries`,
      'record one entry per non-obvious decision',
    );
  }
  return value.map((entry) => {
    const decision = entry as Partial<WorkerDecision>;
    if (!BASES.includes(decision?.basis as DecisionBasis)) {
      invalid(
        'a worker decision cites an authority the contract does not know',
        `\`basis\` is ${JSON.stringify(decision?.basis)}; the order of authority is ${BASES.join(' > ')}`,
        'attribute each decision to the most specific authority that actually settled it',
      );
    }
    return { summary: requireText(decision.summary, 'decisions[].summary'), basis: decision.basis as DecisionBasis };
  });
}

/** Parse a raw worker answer, or refuse it. Nothing unparsed enters the state. */
export function parseWorkerResult(raw: unknown): WorkerResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    invalid(
      'the worker did not answer with the result schema',
      `the answer is ${Array.isArray(raw) ? 'an array' : typeof raw}, not an object`,
      'have the worker return the WorkerResult object; prose is never read as a result',
    );
  }
  const result = raw as Record<string, unknown>;

  if (result.schemaVersion !== 1) {
    invalid(
      'the worker answered with a result schema this CLI cannot read',
      `\`schemaVersion\` is ${String(result.schemaVersion)}`,
      'upgrade the harness, or have the worker emit schemaVersion 1',
    );
  }
  if (!STATUSES.includes(result.status as WorkerStatus)) {
    invalid(
      'the worker reported an unknown status',
      `\`status\` is ${JSON.stringify(result.status)}; known statuses are ${STATUSES.join(', ')}`,
      'report `completed` or `blocked`; there is no partial status',
    );
  }
  const status = result.status as WorkerStatus;

  const branch = result.branch;
  if (typeof branch !== 'string' || !SLUG.test(branch) || branch.split('/').includes('..')) {
    invalid(
      'the worker reported an unusable branch name',
      `\`branch\` is ${JSON.stringify(branch)}`,
      'report the branch the controller created, exactly as it was given',
    );
  }

  const baseSha = result.baseSha;
  if (typeof baseSha !== 'string' || !COMMIT_SHA.test(baseSha)) {
    invalid(
      'the worker reported an unusable base commit',
      `\`baseSha\` is ${JSON.stringify(baseSha)}`,
      'report the full 40-character base commit the worktree was created from',
    );
  }

  const commits = result.commits;
  if (!Array.isArray(commits) || commits.length > MAX_COMMITS || commits.some((sha) => !COMMIT_SHA.test(sha))) {
    invalid(
      'the worker reported an unusable commit range',
      `\`commits\` must be an array of at most ${MAX_COMMITS} full commit ids`,
      'report the ordered commit ids the worker created, never abbreviations',
    );
  }
  if (new Set(commits).size !== commits.length) {
    invalid(
      'the worker reported the same commit twice',
      '`commits` is a linear sequence and cannot repeat an entry',
      'report each commit once, in the order it was created',
    );
  }
  if (commits.includes(baseSha)) {
    invalid(
      'the worker reported its base as part of its own range',
      '`baseSha` is where the range starts FROM, so it is never inside it',
      'report only the commits the worker created on top of the base',
    );
  }

  const headSha = result.headSha === null ? null : (result.headSha as string);
  const lastCommit = commits.length === 0 ? null : (commits[commits.length - 1] as string);
  if (headSha !== lastCommit) {
    invalid(
      'the worker reported a head that is not the end of its range',
      `\`headSha\` is ${JSON.stringify(headSha)} while the range ends at ${JSON.stringify(lastCommit)}`,
      'report the last commit of the range as the head, or null when nothing was committed',
    );
  }

  const files = result.files;
  if (!Array.isArray(files) || files.length > MAX_FILES || files.some((file) => typeof file !== 'string')) {
    invalid(
      'the worker reported an unusable file list',
      `\`files\` must be an array of at most ${MAX_FILES} paths`,
      'report the files the range touched; a larger change belongs to more than one ticket',
    );
  }

  const proofs = parseProofs(result.proofs);
  const blocker = result.blocker === null ? null : requireText(result.blocker, 'blocker');

  if (status === 'completed') {
    if (commits.length === 0) {
      invalid(
        'the worker reported success with no commit',
        '`commits` is empty, and a completed ticket produces a range of at least one commit',
        'report `blocked` with a reason when there is nothing to integrate',
      );
    }
    if (proofs.length === 0) {
      invalid(
        'the worker reported success with no proof that a gate ran',
        '`proofs` is empty, and a completed ticket carries at least one executed gate',
        'run the ticket gates and report each one as a hashed proof',
      );
    }
    if (blocker !== null) {
      invalid(
        'the worker reported success and a blocker at once',
        'a blocker means the ticket did not complete',
        'report `blocked` with the reason, or clear the blocker',
      );
    }
  } else if (blocker === null) {
    invalid(
      'the worker stopped without saying why',
      '`blocker` is null on a blocked result',
      'report what stopped the ticket, in one bounded sentence',
    );
  }

  return {
    schemaVersion: 1,
    ticketId: requireText(result.ticketId, 'ticketId'),
    status,
    branch,
    baseSha,
    headSha,
    commits: commits as string[],
    files: files as string[],
    proofs,
    decisions: parseDecisions(result.decisions),
    blocker,
  };
}
