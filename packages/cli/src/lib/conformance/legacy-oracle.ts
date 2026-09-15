import { z } from 'zod';

const scenarioNames = [
  'install.fresh.claude',
  'install.fresh.codex',
  'install.fresh.both',
  'update.local.claude',
  'update.local.codex',
  'update.local.both',
  'collision.adjacent-skill',
  'collision.managed-refusal',
  'collision.co-owned-config',
  'collision.co-owned-docs',
  'collision.unreadable-settings',
  'rollback.transaction-write',
  'rollback.stale-removal',
  'receipt.corrupt-update',
  'receipt.unsupported-version-update',
  'receipt.unreadable-update',
  'doctor.linked-worktree',
  'runtime.absent',
  'runtime.auth-ambiguous',
  'skill.present.claude',
  'skill.present.codex',
  'autopilot.offline-plan',
  'autopilot.interrupted-release',
  'autopilot.exact-sha',
] as const;

export const LEGACY_ORACLE_SCENARIOS = Object.freeze(scenarioNames);

const scenarioName = z.enum(scenarioNames);
const operation = z.enum(['install', 'update', 'collision', 'rollback', 'receipt', 'doctor', 'runtime', 'skill', 'autopilot']);
const platform = z.enum(['linux', 'darwin', 'win32']);
const runtimeState = z.enum(['claude-only', 'codex-only', 'both', 'absent', 'auth-ambiguous', 'linked-worktree']);
const evidenceOperation = z.enum([
  'install-fresh',
  'update-local',
  'collision-check',
  'rollback-transaction',
  'rollback-stale-removal',
  'update-corrupt-receipt',
  'update-unsupported-receipt',
  'update-unreadable-receipt',
  'doctor-linked-worktree',
  'runtime-absent',
  'runtime-auth-ambiguous',
  'skill-present',
  'autopilot-offline-plan',
  'autopilot-interrupted-release',
  'autopilot-exact-sha',
]);

const exit = z.object({
  kind: z.enum(['exited', 'signaled', 'timed-out', 'spawn-error']),
  code: z.number().int().min(-1).max(255).nullable(),
}).strict();

const expected = z.object({
  classification: z.enum(['success', 'refused', 'unsupported', 'unmanaged']),
  exit,
  diagnostics: z.array(z.string().min(1).max(500)).max(16),
  preservation: z.enum(['not-applicable', 'unchanged', 'restored']),
  recovery: z.enum(['clean', 'resumable', 'unsupported']),
}).strict();

const scenario = z.object({
  id: scenarioName,
  operation,
  platforms: z.array(platform).min(1).max(3),
  runtimeState,
  expected,
  evidenceOperation,
}).strict();

const oracle = z.object({
  $schema: z.literal('https://json-schema.org/draft/2020-12/schema'),
  contractFamily: z.literal('void-machine-legacy'),
  contractVersion: z.literal(3),
  scenarios: z.array(scenario).min(1).max(scenarioNames.length),
}).strict().superRefine((value, context) => {
  const ids = value.scenarios.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['scenarios'], message: 'scenario ids must be unique' });
  }
  for (const item of value.scenarios) {
    if (item.id.startsWith('receipt.') && item.expected.classification === 'success') {
      context.addIssue({ code: 'custom', path: ['scenarios'], message: `${item.id} cannot claim success` });
    }
    if (item.expected.diagnostics.some((diagnostic) => (
      diagnostic.startsWith('/')
      || diagnostic.includes('\\')
      || /(?:secret|token|api[_-]?key|password)/i.test(diagnostic)
    ))) {
      context.addIssue({ code: 'custom', path: ['scenarios'], message: `${item.id} has an unsafe diagnostic assertion` });
    }
  }
});

export type LegacyOracle = z.infer<typeof oracle>;

export type LegacyOracleParseResult =
  | { readonly ok: true; readonly value: LegacyOracle }
  | { readonly ok: false; readonly issues: readonly string[] };

export function parseLegacyOracle(input: unknown): LegacyOracleParseResult {
  const result = oracle.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: Object.freeze(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)),
  };
}
