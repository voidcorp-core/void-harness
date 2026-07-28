// Pure rendering decisions for `doctor`, so the two rules that matter are testable
// without running the command: which marker a check earns, and whether its fix is
// worth printing.
//
// An advisory check is neither a pass nor a failure. It must not carry a green tick
// — "0.17.0 installed, 2.1.0 published" under a checkmark reads as reassurance —
// and its fix must be printed, since an advisory exists precisely to be acted on.

import type { CheckResult } from './prerequisites.js';

export type CheckGlyph = 'pass' | 'fail' | 'unknown' | 'advisory';

export function checkGlyph(check: CheckResult): CheckGlyph {
  if (check.status === 'unknown') return 'unknown';
  if (!check.ok) return 'fail';
  return check.status === 'advisory' ? 'advisory' : 'pass';
}

/** A fix is printed when the check failed, or when it is advisory — never on a clean pass. */
export function checkShowsFix(check: CheckResult): boolean {
  if (check.fix === undefined) return false;
  return !check.ok || check.status === 'advisory';
}
