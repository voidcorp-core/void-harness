// What a security run will actually do, decided before anything runs.
//
// Pure on purpose. Every refusal here has to be provable without a network and
// without a scanner installed, because the refusals are the point: this is
// where an unauthorized target stops, and a decision that can only be tested
// against a live host is a decision nobody tests.
//
// Two rules shape the rest:
//
//   - A target the operator named and could not get authorized refuses the
//     WHOLE run. Falling back to the local scanners would answer a question
//     nobody asked, under a heading that reads like the one they did ask.
//   - A scanner that was skipped for a perfectly good reason still leaves its
//     surface unmeasured, so it is reported as a missing tool. Otherwise an
//     offline run looks exactly like a complete one.

import { join } from 'node:path';
import { authorizeTarget, type ScopeAuthorization, type ScopeRefusal } from '@voidcorp/mission-engine';
import type { SecurityAdapter, SecurityManifest } from './manifest.js';

export type SkipReason =
  | 'no-target'
  | 'tool-missing'
  | 'network-refused'
  | 'destructive-not-authorized';

export interface PlannedAdapter {
  readonly adapter: SecurityAdapter;
  /** The exact argv, target appended behind the flag the adapter named. */
  readonly argv: readonly string[];
  /** Where this tool was told to write its report, when it will not use stdout. */
  readonly reportPath?: string;
}

export interface SkippedAdapter {
  readonly id: string;
  readonly reason: SkipReason;
  readonly detail: string;
}

export type ScanPlan =
  | { readonly kind: 'refused'; readonly reason: ScopeRefusal; readonly detail: string }
  | {
      readonly kind: 'planned';
      readonly run: readonly PlannedAdapter[];
      readonly skipped: readonly SkippedAdapter[];
      /** Command names whose surface went unmeasured, for `judgeScan`. */
      readonly missingTools: readonly string[];
    };

export interface ScanRequest {
  readonly manifest: SecurityManifest;
  readonly posture: { readonly mode: 'fast' | 'team' | 'fortress'; readonly prelaunch: boolean };
  /** Adapter ids proven present, by running their own `versionArgs`. */
  readonly available: readonly string[];
  readonly target?: string;
  readonly authorization: ScopeAuthorization | null;
  /** False for an air-gapped run: an advisory service is still egress. */
  readonly allowNetwork: boolean;
  /** Where tools that will not use stdout are told to write their reports. */
  readonly reportDir?: string;
  readonly now: string;
}

export function planSecurityScan(request: ScanRequest): ScanPlan {
  let destructiveAllowed = false;
  if (request.target !== undefined) {
    const verdict = authorizeTarget(request.target, request.authorization, request.now);
    if (verdict.kind === 'refused') {
      return Object.freeze({ kind: 'refused', reason: verdict.reason, detail: verdict.detail });
    }
    destructiveAllowed = verdict.destructiveAllowed;
  }

  const run: PlannedAdapter[] = [];
  const skipped: SkippedAdapter[] = [];
  const missingTools: string[] = [];

  for (const adapter of request.manifest.adapters) {
    const skip = (reason: SkipReason, detail: string, unmeasured = true): void => {
      skipped.push({ id: adapter.id, reason, detail });
      if (unmeasured) missingTools.push(adapter.command);
    };

    if (!request.available.includes(adapter.id)) {
      skip('tool-missing', `${adapter.command} was not found`);
      continue;
    }
    if (adapter.kind === 'dast' && request.target === undefined) {
      // Not a gap in coverage: nobody asked for a target, so nothing about a
      // running application was in scope to begin with.
      skip('no-target', 'no target was given, so there is nothing to probe', false);
      continue;
    }
    if (!request.allowNetwork && adapter.reach !== 'none') {
      skip('network-refused', `${adapter.reach} reach is refused on an offline run`);
      continue;
    }
    if (adapter.mutates && !destructiveAllowed) {
      skip('destructive-not-authorized', 'the grant does not authorize probes that change state');
      continue;
    }

    const argv = [...adapter.args];
    if (adapter.targetFlag !== undefined && request.target !== undefined) {
      argv.push(adapter.targetFlag, request.target);
    }
    let reportPath: string | undefined;
    if (adapter.outputFlag !== undefined && request.reportDir !== undefined) {
      reportPath = join(request.reportDir, `${adapter.id}.json`);
      argv.push(adapter.outputFlag, reportPath);
    }
    run.push(
      Object.freeze({
        adapter,
        argv: Object.freeze(argv),
        ...(reportPath === undefined ? {} : { reportPath }),
      }),
    );
  }

  return Object.freeze({
    kind: 'planned',
    run: Object.freeze(run),
    skipped: Object.freeze(skipped),
    missingTools: Object.freeze([...new Set(missingTools)]),
  });
}
