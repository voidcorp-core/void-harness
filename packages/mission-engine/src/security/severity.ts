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
// Pure. It classifies and judges; running scanners is somebody else's job.

import type { FindingSeverity } from '../findings/types.js';

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

export type SecurityMode = 'fast' | 'team' | 'fortress' | 'prelaunch';

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
const BLOCKS_AT: Record<SecurityMode, FindingSeverity> = {
  fast: 'high',
  team: 'high',
  fortress: 'medium',
  prelaunch: 'medium',
};

function rank(severity: FindingSeverity): number {
  return ORDER.indexOf(severity);
}

function isNonWaivable(securityClass: SecurityClass): boolean {
  return (NON_WAIVABLE_CLASSES as readonly SecurityClass[]).includes(securityClass);
}

export interface ClassificationInput {
  readonly securityClass: SecurityClass;
  /** What the rule or scanner claimed. Treated as a lower bound, never a cap. */
  readonly reportedSeverity: FindingSeverity;
  readonly mode: SecurityMode;
}

export function classifySecurityFinding(input: ClassificationInput): ClassifiedFinding {
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

  const blocking = rank(severity) >= rank(BLOCKS_AT[input.mode]);
  const rationale =
    input.securityClass === 'unknown'
      ? `the finding is not classified, so it is held at ${severity} rather than assumed harmless${
          blocking ? ` and blocks in ${input.mode}` : ''
        }`
      : `${severity} ${blocking ? 'blocks' : 'does not block'} in ${input.mode} mode`;

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
  readonly mode: SecurityMode;
  /** Tools the scan needed and could not find. */
  readonly missingTools: readonly string[];
}

const STRICT_MODES: readonly SecurityMode[] = ['fortress', 'prelaunch'];

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
  const strict = STRICT_MODES.includes(input.mode);

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
        strict ? `; ${input.mode} requires the proof this tool produces` : ''
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
