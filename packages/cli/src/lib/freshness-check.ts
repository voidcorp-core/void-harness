// Render a freshness verdict as a doctor/status check.
//
// Being behind is ADVISORY, never a blocker: an outdated harness still works, and
// a version check that can fail a health run would turn a network hiccup into a
// broken pipeline. The only thing this reports as unknown is an answer it could
// not establish — it never rounds that up to "up to date".

import type { Freshness, InstallSource } from '@voidcorp/hook-runner';
import type { CheckResult } from './prerequisites.js';

const NAME = 'published version';

export function publishedVersionCheck(
  freshness: Freshness,
  source: InstallSource | undefined,
): CheckResult {
  const { verdict, installed, latest, reason } = freshness;

  if (verdict === 'unknown') {
    return {
      name: NAME,
      ok: true,
      status: 'unknown',
      message: `unknown (${reason ?? 'could not determine the published version'})`,
    };
  }

  if (verdict === 'ahead') {
    return {
      name: NAME,
      ok: true,
      status: 'pass',
      message: `${installed} is ahead of the published ${latest ?? 'release'}`,
    };
  }

  if (verdict === 'up-to-date') {
    return { name: NAME, ok: true, status: 'pass', message: `${installed} is the published version` };
  }

  const message = `${installed} installed, ${latest ?? 'a newer version'} published`;
  if (source === 'local') {
    return { name: NAME, ok: true, status: 'advisory', message, fix: 'run `void-harness update`' };
  }
  if (source === 'marketplace') {
    return {
      name: NAME,
      ok: true,
      status: 'advisory',
      message,
      fix: 'update through the marketplace channel; `void-harness check` compares it',
    };
  }
  // Source undetermined: report the gap, but never name a command that might not apply.
  return { name: NAME, ok: true, status: 'advisory', message };
}
