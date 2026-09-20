// tdd-cover: e2e packages/void-machine/test/doctor-contract.test.ts
import { z } from 'zod';

export type Health = 'healthy' | 'degraded' | 'blocked';
export interface DoctorFinding {
  readonly code: string;
  readonly severity: Health;
  readonly problem: string;
  readonly cause: string;
  readonly repair: string;
}
export interface DoctorPaths {
  readonly repository: string;
  readonly gitCommonDirectory: string;
  readonly stateDirectory: string;
  readonly cacheDirectory: string;
}
export interface DoctorReport {
  readonly health: Health;
  readonly paths: DoctorPaths | undefined;
  readonly findings: readonly DoctorFinding[];
}
export type DocumentInspection =
  | { readonly kind: 'absent' }
  | { readonly kind: 'valid' }
  | { readonly kind: 'malformed'; readonly cause: string }
  | { readonly kind: 'unreadable'; readonly cause: string };
export type MachineDocument = 'config' | 'lock';

// TOML integers retain their type at the parser boundary; 1.0 is not version 1.
export const machineConfigSchema = z.strictObject({
  schema_version: z.literal(1n).optional(),
  state_dir: z.string().optional(),
  cache_dir: z.string().optional(),
});
// Legacy lock metadata has no additional closed schema. Preserve its fields.
export const machineLockSchema = z.looseObject({ schemaVersion: z.literal(1) });

export function documentFindings(
  document: MachineDocument,
  inspection: DocumentInspection,
): readonly DoctorFinding[] {
  if (inspection.kind === 'valid' || inspection.kind === 'absent') return [];
  const file = document === 'config' ? 'machine.toml' : 'machine.lock.json';
  const unreadable = inspection.kind === 'unreadable';
  return [{
    code: `machine.${document}.${inspection.kind}`,
    severity: unreadable ? 'blocked' : 'degraded',
    problem: `${file} ${unreadable ? 'cannot be read' : 'is malformed'}`,
    cause: inspection.cause,
    repair: unreadable
      ? `Make .void/${file} a readable regular file and run void-machine doctor again`
      : `Correct .void/${file} syntax and schema version, then run void-machine doctor again`,
  }];
}

export function doctorReport(
  paths: DoctorPaths | undefined,
  findings: readonly DoctorFinding[],
): DoctorReport {
  const health = findings.some((finding) => finding.severity === 'blocked') ? 'blocked'
    : findings.some((finding) => finding.severity === 'degraded') ? 'degraded' : 'healthy';
  return { health, paths, findings };
}

export function repositoryUnavailable(): DoctorFinding {
  return {
    code: 'git.missing', severity: 'blocked', problem: 'Git repository not found',
    cause: 'Git is unavailable or the current directory is outside a readable Git worktree',
    repair: 'Ensure Git is available and run doctor from a Git worktree',
  };
}
