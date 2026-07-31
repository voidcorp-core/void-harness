// What a security finding is worth, decided from its class rather than from
// what reported it.
//
// The finding ledger already carries `waivable` and `blocking` as booleans. Left
// alone, those come from the scanner — and a scanner is untrusted input by
// contract. A rule that labelled a leaked credential `low, waivable` would be
// believed. So the class carries the floor, and the report may only argue
// upward: it can raise a severity, never lower one.
//
// Three classes can never be waived, in any mode, at any severity:
//
//   - `secret-exposure` — a leaked credential is leaked; a signature does not
//     un-leak it.
//   - `tenant-isolation` — one tenant reading another's data is the failure the
//     whole boundary exists to prevent.
//   - `destructive-migration-without-recovery` — data that cannot be recovered
//     is data that is gone, and no reviewer's approval brings it back.
//
// Mode sets what BLOCKS, never what may be waived. `fast` may let a medium
// finding through; it may not waive a leaked secret.
//
// A verdict is read against a POSTURE, which is two independent things: the
// mission's mode, and whether the project is about to launch. A mode says how
// much rigour this run of work is being given; pre-launch says where the
// product is in its life. A team-mode mission can be three days from a launch,
// and a fortress mission can be nowhere near one — so they are two axes, not
// four values of one enum. Pre-launch may only ever tighten what blocks: if it
// could loosen, the moment closest to shipping would be the most permissive.
//
// Pure. It classifies and judges; running scanners is somebody else's job.

import type { FindingSeverity } from '../findings/types.js';
import type { MissionMode } from '../modes/team.js';

export type SecurityClass =
  | 'secret-exposure'
  | 'tenant-isolation'
  | 'destructive-migration-without-recovery'
  | 'injection'
  | 'authn'
  | 'authz'
  | 'crypto'
  | 'dependency'
  | 'misconfiguration'
  | 'unknown';

export interface SecurityPosture {
  readonly mode: MissionMode;
  /** Whether the project is close enough to a launch to be held tighter. */
  readonly prelaunch: boolean;
}

/** How a posture reads in a rationale a human has to act on. */
export function describeSecurityPosture(posture: SecurityPosture): string {
  return posture.prelaunch ? `${posture.mode} (pre-launch)` : posture.mode;
}

/** Waiving one of these is not a judgement call, so it is not offered. */
export const NON_WAIVABLE_CLASSES = Object.freeze([
  'secret-exposure',
  'tenant-isolation',
  'destructive-migration-without-recovery',
] as const satisfies readonly SecurityClass[]);

export interface ClassifiedFinding {
  readonly severity: FindingSeverity;
  readonly blocking: boolean;
  readonly waivable: boolean;
  /** Why this verdict, in one sentence a reviewer can act on. */
  readonly rationale: string;
}

const ORDER: readonly FindingSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];

/** Severity below which a class cannot be reported, whatever the scanner said. */
const FLOOR: Partial<Record<SecurityClass, FindingSeverity>> = {
  'secret-exposure': 'critical',
  'tenant-isolation': 'critical',
  'destructive-migration-without-recovery': 'critical',
  // Not classified is not harmless: it stays visible enough to be looked at.
  unknown: 'medium',
};

/** Lowest severity that blocks, per mode. */
const BLOCKS_AT: Record<MissionMode, FindingSeverity> = {
  fast: 'high',
  team: 'high',
  fortress: 'medium',
};

/** Lowest severity that blocks once a launch is near, whatever the mode allows. */
const PRELAUNCH_BLOCKS_AT: FindingSeverity = 'medium';

function rank(severity: FindingSeverity): number {
  return ORDER.indexOf(severity);
}

/** The stricter of the two axes wins, so pre-launch can only tighten. */
function blocksAt(posture: SecurityPosture): FindingSeverity {
  const byMode = BLOCKS_AT[posture.mode];
  if (!posture.prelaunch) return byMode;
  return rank(PRELAUNCH_BLOCKS_AT) < rank(byMode) ? PRELAUNCH_BLOCKS_AT : byMode;
}

/** A posture that demands proof rather than accepting an unmeasured surface. */
function demandsProof(posture: SecurityPosture): boolean {
  return posture.mode === 'fortress' || posture.prelaunch;
}

function isNonWaivable(securityClass: SecurityClass): boolean {
  return (NON_WAIVABLE_CLASSES as readonly SecurityClass[]).includes(securityClass);
}

export interface ClassificationInput {
  readonly securityClass: SecurityClass;
  /** What the rule or scanner claimed. Treated as a lower bound, never a cap. */
  readonly reportedSeverity: FindingSeverity;
  readonly posture: SecurityPosture;
}

export function classifySecurityFinding(input: ClassificationInput): ClassifiedFinding {
  const posture = describeSecurityPosture(input.posture);
  const floor = FLOOR[input.securityClass];
  const raised = floor !== undefined && rank(floor) > rank(input.reportedSeverity);
  const severity = raised ? (floor as FindingSeverity) : input.reportedSeverity;

  if (isNonWaivable(input.securityClass)) {
    return Object.freeze({
      severity,
      blocking: true,
      waivable: false,
      rationale: `\`${input.securityClass}\` cannot be waived in any mode${
        raised ? `, and its class floor raises this from ${input.reportedSeverity} to ${severity}` : ''
      }`,
    });
  }

  const blocking = rank(severity) >= rank(blocksAt(input.posture));
  const rationale =
    input.securityClass === 'unknown'
      ? `the finding is not classified, so it is held at ${severity} rather than assumed harmless${
          blocking ? ` and blocks in ${posture}` : ''
        }`
      : `${severity} ${blocking ? 'blocks' : 'does not block'} in ${posture} mode`;

  return Object.freeze({ severity, blocking, waivable: true, rationale });
}

export type ScanCompleteness = 'complete' | 'partial' | 'tool-missing' | 'errored';
export type ScanVerdict = 'green' | 'degraded' | 'blocked';

export interface ScanJudgement {
  readonly verdict: ScanVerdict;
  readonly detail: string;
}

export interface ScanInput {
  readonly completeness: ScanCompleteness;
  readonly posture: SecurityPosture;
  /** Tools the scan needed and could not find. */
  readonly missingTools: readonly string[];
}

/**
 * Judge a scan as a whole.
 *
 * Green requires that the scan actually ran to completion. Everything else is
 * degraded or blocked, because the alternative — reporting green on a scan that
 * measured half the surface — is a false negative that looks exactly like a
 * real pass.
 */
export function judgeScan(input: ScanInput): ScanJudgement {
  const missing = input.missingTools.filter((tool) => typeof tool === 'string' && tool.trim() !== '');
  const strict = demandsProof(input.posture);

  if (input.completeness === 'errored') {
    return Object.freeze({
      verdict: 'blocked',
      detail: 'the scan errored, and a crash proves nothing about the surface it was meant to cover',
    });
  }

  if (input.completeness === 'tool-missing' || missing.length > 0) {
    // A `complete` scan that also reports a missing tool is contradicting
    // itself. Resolved against the run: something was not measured.
    const contradiction =
      input.completeness === 'complete'
        ? 'the scan reports itself complete while naming a tool it could not find, which is a contradiction; '
        : '';
    return Object.freeze({
      verdict: strict ? 'blocked' : 'degraded',
      detail: `${contradiction}missing: ${missing.join(', ') || 'an unnamed tool'}${
        strict ? `; ${describeSecurityPosture(input.posture)} requires the proof this tool produces` : ''
      }`,
    });
  }

  if (input.completeness === 'partial') {
    return Object.freeze({
      verdict: strict ? 'blocked' : 'degraded',
      detail: 'the scan covered part of its surface; what it did not reach is unmeasured, not clean',
    });
  }

  return Object.freeze({ verdict: 'green', detail: 'the scan completed over its declared surface' });
}
