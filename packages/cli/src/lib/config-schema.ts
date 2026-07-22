// Zod schema for .void/config.json — the single source of truth for the
// consumer config shape. doctor validates against it so a malformed paths /
// commands / stack / pin is reported at diagnosis time (with the offending JSON
// path) instead of silently breaking a hook later (audit 2026-07-09, issue #68).
//
// Grounded in the installed zod (v4): z.object strips unknown keys by default,
// so legacy configs with extra fields validate cleanly; safeParse().error.issues
// each carry a `.path` array we render as a dotted JSON path.

import { z } from 'zod';

// A dependency pin: an optional caret/tilde in front of a semver core, with an
// optional prerelease/build tail. Matches what init/add write (`^0.14.0`).
const semverRange = z
  .string()
  .regex(/^[\^~]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'not a semver range (e.g. ^0.14.0)');

// Every field is optional so a legacy or partial config is tolerated; what is
// PRESENT is type-checked. `packs` values must be semver ranges; `paths` and
// `commands` values must be strings.
export const configSchema = z.object({
  core: semverRange.optional(),
  packs: z.record(z.string(), semverRange).optional(),
  stack: z
    .object({
      packageManager: z.string(),
      testRunner: z.string(),
      e2eRunner: z.string(),
      mutationRunner: z.string().optional(),
    })
    .optional(),
  paths: z.record(z.string(), z.string()).optional(),
  commands: z.record(z.string(), z.string()).optional(),
  modes: z.record(z.string(), z.string()).optional(),
});

export type VoidConfig = z.infer<typeof configSchema>;

export interface ConfigValidation {
  readonly ok: boolean;
  /** One human line per problem, each prefixed with the offending JSON path. */
  readonly issues: readonly string[];
}

/** Render a zod issue path (["paths","business"]) as `paths.business`, `(root)` when empty. */
function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.length === 0 ? '(root)' : path.map(String).join('.');
}

/**
 * Validate an already-parsed config object. Returns every problem with its JSON
 * path so the user can find it; never throws.
 */
export function validateConfig(raw: unknown): ConfigValidation {
  const result = configSchema.safeParse(raw);
  if (result.success) return { ok: true, issues: [] };
  const issues = result.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
  return { ok: false, issues };
}

/**
 * Coherence between the packs activated in .claude/settings.json and the packs
 * pinned in .void/config.json. A pack enabled in settings but absent from the
 * config (or vice versa) means one of the two is stale — the plugin loads but is
 * unpinned, or is pinned but never loads. Both plain pack-name sets EXCLUDE the
 * core plugin (its pin lives in config.core, not config.packs). Pure; returns a
 * human line per divergence, empty when in sync.
 */
export function packsCoherenceIssues(
  enabledPackNames: readonly string[],
  configPackNames: readonly string[],
): readonly string[] {
  const enabled = new Set(enabledPackNames);
  const pinned = new Set(configPackNames);
  const issues: string[] = [];
  for (const name of enabled) {
    if (!pinned.has(name)) issues.push(`${name}: enabled in settings.json but not pinned in .void/config.json`);
  }
  for (const name of pinned) {
    if (!enabled.has(name)) issues.push(`${name}: pinned in .void/config.json but not enabled in settings.json`);
  }
  return issues;
}
